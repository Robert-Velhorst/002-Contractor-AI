# Codex Worklog

## 2026-09-25 - Magazijnvoorraad als herstelroute voor materiaaltekort

- Een actuele materiaaltekortcasus toont nu apart vrije eigen voorraad,
  magazijnuitgifte onderweg en nog niet ontvangen leveranciersbestellingen.
  Alleen voorraad die expliciet aan hetzelfde catalogusartikel en dezelfde
  eenheid is gekoppeld kan vanuit de herstelcasus worden uitgegeven.
- De kantooruitgifte reserveert voorraad en boekt de zending binnen dezelfde
  ledgertransactie, met voorraadtel-, transport- en bewijsreferentie plus
  verwachte aankomsttijd. Exacte retries zijn idempotent; veranderde bron,
  voorraad, eenheid, tekort of uitvoerderrol blokkeren de handeling. De planning
  telt de hoeveelheid als onderweg en houdt haar onbeschikbaar tot een
  locatieontvangst is vastgelegd.
- Operationeel-herstel- en API-tests slaagden (20/20 samen), inclusief
  hoeveelheidsgrenzen, kantoor/veldrollen, onveranderde externe verplichtingen
  en herbeoordeling na bronwijziging. De nieuwe componenttests slaagden (2/2);
  de volledige frontend-suite slaagde (190/190) en de volledige Node-suite
  (810 geslaagd, 47 PostgreSQL-afhankelijke tests overgeslagen, 0 mislukt).
  Gerichte ESLint en Vite productiebuild slaagden. `verify:bundle` blijft rood:
  gzip totaal 627.776/578.500 bytes, Brotli 542.858/540.000, client 8.551/8.500,
  vervangingsplan 1.616/1.600 en herstelacties 1.025/900; budgetten zijn niet
  verhoogd.
- Grenzen: de ontvangstbevestiging op de bouwplaats blijft een aparte
  uitvoerdersactie; magazijnuitgifte bevestigt geen fysieke aankomst. Geen
  bericht, inkoop, betaling, externe verplichting, deployment, commit of push.

## 2026-09-25 - Herstel van klantreacties op deelopleveringen

- Klantconcepten en onzekere antwoordcommando's herstellen nu binnen dezelfde
  browsertab, maximaal 12 uur en uitsluitend voor dezelfde klantlink, aanbieding
  en bronversie. Een herladen reactie gebruikt dezelfde idempotentiesleutel en
  exact dezelfde payload.
- Een bevestigde foto wordt niet opnieuw geupload. Bij onzekere foto-ontvangst
  moet de klant het oorspronkelijke bestand opnieuw kiezen; alleen een gelijke
  SHA-256-hash laat de herhaling met dezelfde uploadidentiteit toe. Tokens,
  bestandsbytes en File-objecten worden niet opgeslagen.
- Gerichte componenttests slaagden (7/7), inclusief herstel na unmount/remount,
  tokenisolatie, onzekere foto-upload, exact antwoordherstel en uitsluiting van
  token/fotodata uit browsersessie-opslag. Gerichte ESLint en de Vite-build
  slaagden. Releasecontractcontrole slaagde (101 canonieke paden, 12 uitgefaseerde
  paden, 17 hosted omgevingssleutels). De volledige frontendrun had 147/148
  successen door een bestaande Conversation-RFI-test die de 5-secondenlimiet
  raakte; dezelfde testfile slaagde afzonderlijk (5/5). Geen API-contract,
  providerverbinding of externe actie gewijzigd.
- Grenzen: dit is geen herstel tussen tabs/apparaten en geen offline portaal.
  Serverintrekking, verlopen toegang en gewijzigde bronnen blijven leidend.

## 2026-09-24 - Duurzame sessies voor uitvoerders

- Het uitvoerdersportaal bewaart geen sessies meer alleen in servergeheugen.
  Een login-token wordt als SHA-256-hash met verval- en intrekkingsgegevens in
  het ledger opgeslagen. Opnieuw starten van de server verbreekt de sessie niet;
  uitloggen, schorsen, identiteitskoppeling en databaseherstel trekken sessies
  expliciet in.
- Migratie 088 voegt het sessieregister en de benodigde indexen toe. Herstel en
  lokale-naar-hosted migratie trekken oude tokens in om hergebruik in een andere
  omgeving te voorkomen.
- Gerichte ledger-, API-, herstel-, identiteits- en migratietests plus lint
  slaagden. De volledige Node-suite slaagde: 738 geslaagd, 46 overgeslagen,
  0 mislukt. De overgeslagen PostgreSQL-integratietests konden niet draaien
  zonder `CONTRACTOR_AI_POSTGRES_TEST_URL`; hosted PostgreSQL is dus niet
  geverifieerd. Geen provideractie, deployment, commit of push uitgevoerd.

## 2026-09-24 - Recovery closure proves linked source resolution

- Recovery cases now stay open while linked material quantities remain short,
  safety incidents remain unresolved, worker assignments still overlap an
  absence, or affected client appointments/contract dates lack current review.
  Field-task blockers still require the same worker's later resumption report.
- Case closure records a source-versioned resolution review in the snapshot and
  audit metadata. Integrity diagnosis rejects edits to that proof even when a
  modified snapshot is re-checksummed. Stale sources must be reassessed in a
  separate command before closure.
- Focused recovery domain/API tests passed (12/12), recovery UI tests passed
  (7/7), and production-bundle recovery browser tests passed (4/4), including
  desktop/mobile layout and accessibility. ESLint passed. No provider,
  deployment, commit or push occurred.

## 2026-09-24 - Client appointment recovery is bound to actual chat evidence

- Replaced new customer-impact review free-text references with a selection from
  retained incoming messages under the approved conversation for the affected
  appointment's job. Server validation checks the appointment, case and global
  source versions, access, direction, job and message hash.
- The review retains message id, access id, exact hash, time and a bounded text
  excerpt. Conversation changes stale the source; record verification checks
  that the retained audit event still proves the selected incoming message.
  Focused ledger coverage confirms new chat content forces explicit case
  reassessment before a review can be saved.
- Focused ledger/API tests passed 11/11, recovery UI tests passed 5/5, and all
  four operational-recovery browser workflows passed. Lint and Vite production
  build, release-contract check and bundle verification passed. Aggregate gzip measured 568,422 / 570,800
  bytes; the client-appointment UI limit increased from 2,000 to 2,100 bytes and
  measured 2,017 bytes to accommodate the linked-message selector and evidence.
- No customer message, appointment change, provider action, deployment, commit
  or push occurred. Contract completion dates remain separate and are not
  inferred from customer chat or internal schedule dates.

## 2026-09-24 - Unknown-return workforce availability

- Added an open-ended worker availability block for cases where the return date
  is not known. A review date within 31 days is mandatory, conflicting end dates
  are rejected, and the follow-up never silently restores capacity. No medical
  or family-care details are collected.
- Assignment conflict checks and the workforce capacity view retain the block
  beyond the review date. Removing it still requires the existing approval-backed
  cancellation path; the system does not move jobs or contact anyone.
- The full Node suite passed: 658 passed, 46 PostgreSQL-only skips, no failures.
  Frontend passed 67 tests / 19 files; the unknown-return PostgreSQL contract,
  workforce browser flows, lint, production build and release checks passed.
- Latest total gzip assets measured 547,160 / 549,000 bytes; the Work Balance
  chunk measured 4,186 / 5,000. The release contract checked 93 canonical paths,
  12 retired paths, 17 hosted environment keys and 599 source files.
- Fixed mobile browser verification to wait for the navigation panel's CSS
  transition before measuring and capturing the viewport. Refreshed package and
  container smoke checks passed: Windows Node 22.23.2 and container migration
  082, zero pending migrations, authenticated non-root/read-only runtime and
  persistent-volume restart. Temporary package/container resources were removed.
- Isolated test localStorage now supports identity persistence tests under the
  current jsdom/Node runtime and is cleared between tests. The original local
  operator database remains untouched. No commit, push, deployment or provider
  action occurred; broader disruption recovery remains unfinished.

## 2026-09-24 - Availability conflict replacement planning

- Each retained availability/assignment conflict now returns up to five
  replacement suggestions. Candidates are excluded for schedule conflicts,
  unavailability, role mismatch, pending retirement, or a mandatory
  qualification blocker. Ranking uses visible skill overlap, standby status,
  then name; it does not rely on hidden quality scores.
- The availability panel shows each affected assignment and candidate context.
  “Plan with …” opens the job resource planner with that worker and the impacted
  assignment window prefilled. Saving remains explicit; existing assignment
  approval, safety and dispatch rules still run. Nothing contacts the worker or
  automatically releases or shifts the existing assignment.
- Full Node suite: 659 passed / 46 PostgreSQL-only skipped / zero failures;
  frontend 67 passed; workforce browser path passed through the prefilled
  planner; ESLint, release contract and bundle budget passed. Bundle gzip was
  548,062 / 549,000 bytes. Windows standalone and container smoke checks passed
  on migration 082; disposable package and container resources were cleaned up.
- Original operator data remains untouched. No commit, push, deployment or
  provider action occurred. Atomic assignment replacement and schedule
  re-optimization remain future work.

## 2026-09-24 - Work balance release and transfer verification

- Completed the migration 082 work-balance acceptance pass without starting or
  migrating the original operator runtime. The active ledger database was not
  modified; hosted PostgreSQL checks used a disposable TLS-verified instance.
- The complete Node suite passed 657 tests; 46 PostgreSQL-only tests were
  skipped in local mode, with zero failures. The PostgreSQL work-balance and
  governed company-handover runs passed separately against disposable PostgreSQL.
- The frontend suite passed 67 tests across 19 files. Desktop/mobile Chromium
  E2E, accessibility and overflow checks passed; screenshots were inspected.
- Lint, production build, release contract and bundle budget passed. Gzip assets
  measured 546,607 bytes / 549,000; the work-balance feature measured 4,186 /
  5,000 bytes.
- Rebuilt the Windows standalone package and verified Node 22.23.2, migration
  082, zero pending migrations and the packaged work-balance backup/handover
  round-trip. The production container smoke passed non-root/read-only,
  authenticated startup, persistence/restart and packaged handover checks.
- Disposable PostgreSQL/container resources were removed. No deployment,
  commit, push, provider action or customer communication occurred. The
  total-solution scope remains in progress; the original local database remains
  untouched.

## 2026-09-05 - Offline drawing bytes, local model evaluation and Android source

- Added scoped, approved/current drawing retrieval with exact pack revision,
  MIME/signature/size/hash validation and reauthorization after private reads.
  Web work-pack downloads now encrypt actual PDFs alongside the snapshot. Added
  offline opening/export and backward-compatible compact ciphertext encoding.
- Corrected expired-vault behavior: old work packs disappear, while unsent
  responses remain recoverable with the original identity. Native source includes
  matching access checks, a seven-day display timer and PDF failure handling.
- Added native Android Java source using the same ledger, Android Keystore,
  atomic encrypted writes, native PDF rendering and idempotent response queues.
  No Android SDK is installed. The build helper was invoked and correctly stopped
  at that prerequisite; compilation, APK output, emulator/phone tests and release
  signing are NOT verified. JDK 21 was downloaded and hash verified locally.
- Installed official portable Ollama 0.33.3 with verified archive SHA-256 and
  loopback/cloud-disabled configuration. Real synthetic Dutch adapter calls to
  Qwen2.5 1.5B, Qwen2.5 3B and Qwen3 4B did not establish adequate refusal
  interpretation. Qwen3 4B separated the two intents but proposed soliciting
  acceptance from the refusing client. The strict evaluation exited nonzero.
  Application analysis remains disabled; vision and full-route live evaluation
  remain unverified. A reusable startup helper was tested without enabling AI.
- Inspected the explicitly selected logged-in Meta profile and its business
  portfolio. No WhatsApp account was present. Opened the creation wizard and
  handed off at provider terms/CAPTCHA. No account creation, phone migration,
  new credential, external message, commit or push was performed.
- Focused Node/API tests passed 17/17, including private PDF bytes, missing auth,
  impersonation, stale source, revocation and legacy-vault decryption. Browser
  verification passed three selected scenarios, including offline PDF export
  byte equality, persisted questions, sync and expiry. A test initially looked in
  the wrong section; a subsequent test-side fetch of a blob was blocked by CSP.
  Verification now exercises the real explicit download control without weakening
  CSP. The final mobile screenshot, download touch target and scoped accessibility
  checks passed. Only three selected browser scenarios were run, not the entire
  browser suite or native-device scenarios.
- Final full Node run: 604 tests, 568 passed, 36 environment skips, zero failures
  in 662.23 seconds. Full frontend run: 26 passed. Final three browser scenarios
  passed in 1.0 minute. Lint, release/HAI contracts, build and bundle budget passed
  (491,638 total gzip bytes against 500,000). A concurrent lint run initially hit
  a removed Playwright output directory; generated browser/Android build folders
  are now explicitly ignored and the rerun passed. Both PowerShell helpers parse.
- Windows package rebuilt and its isolated smoke passed on Node 22.23.2. Its
  tunnel and HAI assertions remain fixtures, not actual provider acceptance.
  Before restarting the local app, created an ignored SQLite checkpoint backup
  with `integrity_check=ok` and 321 audit records. Restarted only the verified
  port-34123 process; new PID 35864 is loopback-only, ready, with no pending
  migrations and the same verified audit head/321 records. Scheduler, application
  AI and WhatsApp remain disabled. Reloaded the actual in-app browser: dashboard
  loaded and the inspected error log was empty. User records were not reset.

## 2026-09-05 - Connected offline, customer and channel experiences

- Added private, portal-access-scoped text/photo conversations using ledger
  communications, private documents, approvals and immutable source audit events.
  Office and customer share paged reply context; outbound messages require approval
  and explicit publication. Old job-wide portal updates cannot expose chat drafts.
- Added customer and office React conversation surfaces, private photo previews,
  retry keys, source-linked draft replies and provider/analysis controls. Legacy
  text intake remains compatible but is not automatically imported into the chat.
- Added encrypted IndexedDB work-pack snapshots and a static offline entry, a
  passphrase/expiry/recovery flow, durable local questions/read acknowledgments,
  original-account synchronization and stale-source conflicts. A browser regression
  exposed premature queue counts before encryption completed; state now changes
  only after persistence. Existing field-evidence outboxes remain separate.
- Added optional loopback Ollama structured analysis, exact quotation validation,
  limited optional photo analysis with verified source hashes, uncertainty and
  retained model/source identity. Stale analysis cannot originate a new linked
  draft. No model was installed or invoked live; no external AI service was used.
- Added disabled-by-default Meta WhatsApp Cloud API support: exact-body signatures,
  approved recipient binding, replay-safe inbound text/photos, private bounded media
  ingestion, explicit approval-gated sending, durable unknown-outcome protection and
  monotonic delivery receipts. Reauthorization is repeated after private file reads
  before even a media upload; its failing/passing regression was verified.
- Added runtime module packaging, offline-shell package smoke assertions, example
  configuration and the operator/developer guide `CONNECTED_EXPERIENCES.md`.
- Latest full Node run at this point: 600 tests, 563 passed, 36 environment skips,
  one performance-threshold failure under concurrent heavy verification load
  (1,231.83 seconds). No threshold was relaxed. The same three benchmark tests
  passed separately in 2.41 seconds; the measured smoke test took 1.67 seconds.
  The final focused conversation/offline/model/channel/API run passed all 13 tests,
  including an additional source-origin test added after the full run started.
- Final full frontend run passed 26 tests (39.04 seconds). Lint, including the
  new `.mjs` modules, release/HAI contracts, `git diff --check`, production build
  and bundle budget passed. Assets total 490,386 gzip bytes against 500,000.
  The HAI check does not exercise the actual external parser.
- Final isolated Playwright run passed all three selected scenarios in 36.4
  seconds: customer photo persistence/approval/publication and office draft entry,
  offline reload/queue/reload/reauthorized sync, plus the existing mobile work-pack
  regression. Scoped axe/overflow checks passed and mobile/desktop screenshots
  were inspected. Two office-test locator ambiguities were corrected. This was
  not a run of the entire 107-scenario browser suite or a native-phone test.
- Rebuilt the Windows distribution with Node 22.23.2 and passed its isolated
  startup smoke, including the offline shell and disabled webhook. Tunnel lifecycle
  and HAI export assertions use fixtures, not real external providers.
- Restarted only the verified loopback server on port 34123 (PID 52808). Readiness
  is ready, no migrations are pending, the 321-event audit chain remains valid,
  the offline HTML/service worker return 200, and disabled WhatsApp returns 503.
  Autonomous scheduling remains disabled. The user's database was not reset or
  populated with synthetic conversation/field records.
- This is not complete native-mobile, model-quality, live Meta or hosted-provider
  acceptance. Offline drawing bytes/full briefings and cross-company isolation in
  older screens remain open. No live messages, provider purchases, commits or
  pushes were performed.

## 2026-09-05 - Personal mobile execution work packs

- Added the ledger-backed `field-work-pack.js` projection and scoped API routes,
  with named-worker assignments checked before pagination and personal responses.
  The final revocation regression exposed declined/offline assignments; all pack
  access and job-list filtering now reuse the ledger's canonical status predicates.
- Added a lazy, bilingual mobile work-pack component with Kunnen/Weten/Hebben/Doen,
  revision comparison, explicit read confirmation, questions/blockers, office
  preview and handoffs to existing execution and photo/field-report forms.
- Read acknowledgments and questions retain the shown projection in the existing
  audit chain. Stale-source writes and changed retry payloads fail; identical
  retries do not duplicate reports. Questions enter the office approval queue.
  Nothing grants safety clearance or makes an external commitment.
- Added Docker/Windows runtime inclusion, packaged endpoint smoke assertions,
  user/developer documentation and explicit remaining product boundaries.
- Full Node run: 588 tests, 552 passed, 36 PostgreSQL/environment skips, zero
  failures (410.68 seconds). After final status-predicate/source-projection edits,
  all five focused unit/API tests passed. Full frontend run: 23 passed. Lint,
  release contract, HAI contract, production build and bundle budget passed;
  production assets total 479,517 gzip bytes against the 500,000-byte budget.
- Used the repository Playwright harness because the browser plugin/skill was
  unavailable. The authenticated work-pack scenario passed with mobile 390x844,
  desktop 1440x1000, Dutch/English, revision invalidation, question persistence,
  offline submission guards, execution/photo-form navigation and scoped axe checks.
  Screenshots were inspected. An existing field-session task-completion scenario
  also passed; this was not a run of the complete 105-scenario browser suite.
- Rebuilt the Windows distribution on Node 22.23.2 and passed its isolated
  smoke test, including the work-pack endpoint. Restarted only the verified
  loopback server on port 34123. Readiness remains ready, no migrations are
  pending, and the existing 321-event audit chain remains valid; no runtime data
  reset or QA record insertion was performed in the user's local database.
- Full offline work packs, native/installable distribution, full safety briefing,
  drawing viewing, company isolation across older screens, office reply timelines,
  multimedia customer conversations, source-linked AI and WhatsApp are not claimed.
  Live PostgreSQL, container deployment and real external providers were not tested.

## 2026-09-04 - Durable dossier coverage, change impact and three product experiences

- Added `contractor-review.js`: keyset traversal of every dossier status without
  the 500-job window, durable leased batches, retained findings, membership-change
  detection, restart recovery and coverage failure on missed/failed dossiers.
  Five named checks cover schedule inputs, customer target, pending approvals,
  budget forecasts and approved scope; this is not comprehensive certification.
- Added a source-bound, replay-safe internal change analysis using the existing
  critical-path calculator with in-memory duration overrides. Linked job records
  and explicit cost/revenue estimates are retained with stale-source detection;
  no task, schedule, agreement, purchase or payment is changed by analysis.
- Added role-guarded APIs and a lazy bilingual Today control with dossier
  pagination, batch progress, analysis preview/retention, source navigation,
  error recovery, accessible controls and responsive layout. The existing
  autonomous scheduler advances the review and the owner stop remains effective.
- Added the runtime module to Docker and Windows packaging, and verified the new
  endpoint from a freshly built Windows distribution. The expired-lease UI no
  longer blocks recovery after an interrupted worker.
- Recorded Roberts three-experience product direction in
  `THREE_PRODUCT_EXPERIENCES.md` and the README: contractor control, a phone-first
  execution work pack, and conversational customer interaction around one dossier.
  Inspected the existing field view and client text-message path. The full mobile
  work pack, multimedia conversation, source-linked AI analysis pipeline and
  WhatsApp channel are explicitly future work, not claimed implementations.
- Verification: full Node run 580 tests, 544 passed, 36 PostgreSQL/environment
  skips, zero failures (553.98 seconds). After the final recovery/status changes,
  all eight focused review unit/API tests passed. All 20 frontend tests passed.
  Lint, production build, release contract, HAI contract and bundle budget passed
  (472,913 gzip bytes). Fresh Node 22.23.2 Windows package smoke passed with the
  review endpoint available and no pending migrations.
- Browser plugin/skill was unavailable; used the repository Playwright harness.
  Three focused Chromium workflows passed, then the revised impact workflow was
  rerun successfully with real dependency-delay assertions, desktop 1440x1000,
  mobile 390x844, Dutch/English switching, persisted analysis, source navigation,
  zero relevant console errors and zero scoped axe violations. Screenshots were
  inspected. The final expired-lease predicate was additionally unit/frontend
  tested and rebuilt. The complete 104-workflow browser suite, live PostgreSQL,
  container runtime and external providers were not validated in this increment.
- Restarted only this task's verified local server, now PID 43456 on
  `http://127.0.0.1:34123/`. Live health reports ready, SQLite operational,
  evidence storage verified and the review endpoint available. No real dossier
  was changed by a test, no provider activated, and no commit/push was performed.

## 2026-09-04 - Connected contractor daily workbench

- Added a lazy Today workbench over the canonical command-plan API: combined
  stream/decision/search filters, server-side action pagination, matching counts,
  bounded coverage disclosure, job/approval/opportunity navigation, and owner-only
  internal draft preparation. Field principals retain assignment-scoped access.
- Added a contractor operating model covering acquisition through aftercare,
  cross-domain dependencies, human decision boundaries, and staged follow-up work.
  The README links the model and documents the additive API fields and limits.
- Fixed selected commands outside the first preview page, explicit rejection of
  blocked commands, reporting of unavailable selections, and accidental merging
  of separate opportunity follow-ups. Preserved source context for localization
  and navigation; expose the current automation suspension state on reads.
- Fixed contrast in the existing automation-run status and distinguished approval
  links from job links. Browser test locale changes are restored before later
  workflows; the discovery inventory now includes both new browser scenarios.
- Verification: production build, lint, release contract, HAI contract, bundle
  budget (467,140 gzip bytes), 17 frontend tests, and seven focused Chromium
  workflows passed. Browser evidence covers 1440x1000 desktop, 390x844 mobile,
  workbench accessibility, console health, persisted drafts, replay, source
  navigation, the safety stop, QA archive review, and localization.
- The full Node run recorded 575 tests: 538 passed, 36 environment/PostgreSQL
  skips, and one outdated browser-inventory expectation (101 instead of 103).
  After correcting that expectation, all 25 tests across static-performance,
  server-api, auth-guard, and command-workbench passed. The full suite was not
  rerun after this test-only correction; the complete 103-workflow browser suite,
  Postgres, container and Windows packaging were not rerun for this increment.
- Started the current local application on loopback port 34123; database and
  evidence-storage readiness passed. No provider was activated, no production
  deployment was made, and no commit or push was performed.

## 2026-08-14 - Verified authenticated ngrok lifecycle

- Replaced URL-returned tunnel readiness with an end-to-end lifecycle: loopback
  database/storage health, anonymous public rejection, owner-authenticated public
  runtime identity, exact HTTPS origin, loopback binding, and final verified state
  must all pass before the launcher prints the public URL.
- Startup failure and normal shutdown now close external ingress before draining
  the app. Duplicate stop signals share one promise, and bounded readiness parsing,
  timeouts, redirect rejection, and response-size limits prevent an edge response
  from holding the launcher open or consuming unbounded memory.
- Added mock failure-path coverage, a real production-server edge traversal, runtime
  diagnostics/UI states, release guards, and a packaged Windows lifecycle smoke.
  The real-server test caught and fixed the canonical `verified` storage-state and
  authenticated `/api/readiness` assumptions during development.
- Current-source gates pass: 3,556 unique specialist translation keys with zero
  duplicates; 11 frontend tests; 540 Node tests (504 passed and 36 PostgreSQL or
  environment skips); all 101 Chromium workflows in 26 isolated batches;
  release/lint/build/bundle at 462,638 total gzip bytes; production benchmark;
  hardened container; and Node 22.23.2 Windows package.

## 2026-08-14 - Verified HAI local-feed publication

- Added an owner-only HAI publication lifecycle that inspects the configured
  absolute local-feed path, atomically replaces the bounded JSON feed, reads it
  back through the native contract validator, and reports its item count, SHA-256,
  and publication time in Operations.
- Kept the integration review-only: every response and feed item declares no
  execution authority and zero external commitments. Hosted startup rejects a
  relative feed path, and non-owners cannot inspect or publish the configured path.
- Added unit, API-role, startup, Windows standalone, and bilingual browser coverage.
  The packaged Node 22.23.2 runtime published and verified a real local file, and
  the maintained HAI parser accepted the same `accountfeed.GenericItem` contract.
- Current-source gates pass: 3,553 unique specialist translation keys with zero
  duplicates; 11 frontend tests; 537 Node tests (501 passed and 36 PostgreSQL or
  environment skips); all 101 Chromium workflows in 26 isolated batches; release,
  HAI, build, bundle, performance, container, and Windows standalone verification.

## 2026-08-14 - Workforce readiness and governed permits bilingual pass

- Localized crew creation/editing/retirement, qualification requirements,
  credential evidence, availability windows, and work permits without translating
  retained names, roles, notes, source references, hazards, controls, or conditions.
- Added a Dutch retained-evidence browser journey through assignment approval,
  qualification verification, availability, permit approval, worker acknowledgement,
  suspension, closeout, mobile containment, English round trip, axe, and empty logs.
- Browser debugging found and fixed stale saved-editor recovery, under-contrast
  resource/field metadata, comma-split permit instructions, and invalid singular
  copy in permit blockers and dormant-assignment retirement safeguards.
- Current-source gates pass: 3,540 unique specialist translation keys with zero
  duplicates; 11 frontend tests; 535 Node tests (499 passed and 36 PostgreSQL or
  environment skips) in 96.8 seconds; all 100 Chromium workflows in 25 isolated
  batches in 508.2 seconds; release/HAI/lint/build/bundle at 461,958 total gzip
  bytes; production benchmark; hardened container; and Node 22.23.2 Windows package.

## 2026-08-14 - Owner administration bilingual and browser standards pass

- Localized business onboarding and retained identity, managed team access,
  autonomous safety suspend/resume, and QA archive maintenance while preserving
  canonical roles, statuses, safety reasons, confirmation phrases, access-key
  secrecy, and retained organization values.
- Added a Dutch mobile owner journey covering onboarding, exact API identity,
  operator creation, one-time key presentation, rotation, deactivation, safety
  controls, QA preview, English round trip, axe, containment, and empty error logs.
- Browser and accessibility testing found and fixed three invalid HTML patterns
  and three low-contrast metadata/step-label defects in the production interface.
- Current-source gates pass: 3,329 unique specialist translation keys, 10 frontend
  tests, 535 Node tests (499 passed and 36 PostgreSQL/environment skips) in 70.1
  seconds, all 99 Chromium workflows in 25 isolated batches in 498.2 seconds,
  release/HAI/lint/build/bundle at 455,338 total gzip bytes, production benchmark,
  hardened container, and Node 22.23.2 Windows standalone verification.

## 2026-08-14 - Equipment lifecycle and custody bilingual pass

- Localized the complete equipment register, office and field custody handoff,
  return/quarantine, inspection, maintenance, readiness, and approval-gated
  retirement chain while preserving retained names, notes, references, findings,
  meter values, and API enums verbatim.
- Added a Dutch production-browser journey covering creation, failed inspection,
  corrective maintenance, passing reinspection, reload persistence, reservation,
  checkout, damaged return, retirement request, exact API evidence, English round
  trip, axe, mobile containment, and empty console errors.
- The axe pass found and fixed shared low-contrast resource metadata and custody
  labels instead of excluding the rule.
- Current-source gates pass: 3,161 unique specialist translation keys, 10 frontend
  tests, 535 Node tests (499 passed and 36 PostgreSQL/environment skips) in 114.0
  seconds, all 98 Chromium workflows in 25 isolated batches in 525.8 seconds,
  release/HAI/lint/build/bundle at 450,343 total gzip bytes, production benchmark,
  hardened container, and Node 22.23.2 Windows standalone verification.

## 2026-08-14 - Tender and purchasing bilingual pass

- Localized the governed procurement chain from bid-package registration and
  retained return comparison through preferred selection, approved purchasing
  commitment, immutable PDF/UBL purchase-order package, and verified provider
  receipt. Retained commercial names, scope, rationale, exclusions, qualifications,
  and evidence remain verbatim across locale changes.
- Added a Dutch production-browser journey covering creation, approvals, reloads,
  exact API evidence, immutable order delivery, axe, mobile containment, English
  round trip, and empty console/page-error logs. It found and fixed low-contrast
  procurement summary and participant labels.
- Current-source gates pass: 2,997 unique specialist translation keys, 10 frontend
  tests, 535 Node tests (499 passed and 36 PostgreSQL/environment skips) in 125.5
  seconds, all 97 Chromium workflows in 25 isolated batches in 610.8 seconds,
  release/HAI/lint/build/bundle at 446,090 total gzip bytes, production benchmark,
  hardened container, and Node 22.23.2 Windows standalone verification.
- In-app Browser navigation to the isolated local runtime was blocked by Browser
  URL policy; the repository production-browser harness passed the same built flow.

## 2026-08-14 - Job costing and cost-to-complete bilingual pass

- Localized finance readiness across job metrics, status, primary actions, risk
  chips, cost-code details, forecast warnings, retained forecast history, policy,
  action buttons, download names, notices, errors, and empty states.
- Added structured milestone sequence and warning count/amount/currency fields so
  Dutch presentation does not parse or rewrite retained English evidence.
- Added a retained-evidence browser workflow covering Dutch rendering, reload,
  forecast freeze, API readback, axe, mobile containment, English round trip, and
  empty console/page-error logs. It also found and fixed cost-table keyboard focus
  and compact-summary contrast defects.
- Current-source gates pass: 2,843 unique specialist translation keys, 10 frontend
  tests, 534 Node tests (498 passed and 36 PostgreSQL/environment skips) in 72.4
  seconds, all 96 Chromium workflows in 24 isolated batches in 461.5 seconds,
  release/HAI/lint/build/bundle at 442,076 total gzip bytes, production benchmark,
  hardened container, and Node 22.23.2 Windows standalone verification.
- In-app Browser navigation to the isolated local runtime was blocked by Browser
  URL policy; the repository production-browser harness passed the same built flow.

## 2026-08-14 - Field assurance and incident bilingual pass

- Passed the retained operator locale through the Field workspace, field-assurance
  queue, NCR register, observation/incident register, and assurance review dialog.
- Localized forms, categories, statuses, metrics, recommendations, safeguards,
  validation outcomes, action labels, and accessible names while preserving job,
  worker, evidence, title, fact, containment, correction, and verification text.
- Added a Dutch observation persistence and English round-trip browser workflow,
  review-dialog interaction, retained API evidence assertions, mobile containment,
  component translation contracts, and static locale-wiring guards.
- In-app Browser QA found and fixed an untranslated lowercase quality category,
  then confirmed reload persistence, translated server-owned assurance actions,
  exact desktop/mobile containment, and an empty console error log.
- Current-source gates pass: 10 frontend tests, 534 Node tests (498 passed and 36
  PostgreSQL/environment skips) in 78.6 seconds, all 95 Chromium workflows in 24
  isolated batches, 2,705 unique specialist translation keys, release/HAI/lint/
  build/bundle at 438,874 total gzip bytes, the production benchmark, hardened
  container, and Node 22.23.2 Windows standalone verification.

## 2026-08-14 - Quality and closeout bilingual pass

- Localized the governed quality and closeout chain in Dutch and English:
  before/during/after photo evidence, installation and quality-control inspection
  checklists, punch items, warranty claims, aftercare, client feedback, handover,
  and recurring-service preparation. Retained titles, observations, measurements,
  witnesses, locations, comments, filenames, and other operator evidence remain
  verbatim across language changes.
- Expanded the lazy specialist operator catalog from 1,416 to 1,730 unique keys
  with no duplicates or missing literal keys for the targeted controls. Existing
  browser journeys now prove Dutch rendering and an English round trip after the
  full approval-backed quality and closeout lifecycles.
- Fixed a preference race where a background refresh started before a successful
  locale change could later restore its older session snapshot. The active
  operator choice now wins for the current session, failed writes roll back, and
  sign-in/sign-out clear the override.
- Localized the complete governed daily execution chain in Dutch and English:
  daily start huddles and end-of-day reports, approved production baselines,
  offline installed-output capture and reversals, and regiewerk quantity,
  receipt-only acknowledgement, and source-bound variation conversion.
- Expanded the lazy specialist operator catalog from 1,208 to 1,416 unique keys
  with no duplicates or missing literal keys for the targeted controls. Existing
  browser journeys now prove Dutch rendering and exact retained English field
  notes, quantities, cost codes, rationale, and evidence across locale changes.
- Localized the complete source-bound commercial workflow in Dutch and English:
  written scope and allowances, project risk and premortem, fixed-price-versus-regie
  selection, estimate and quote registers, acceptance evidence, verified delivery,
  and numbered formal variations. The same retained English contract and risk
  evidence remains unchanged when the interface switches to Dutch.
- Expanded the lazy specialist operator catalog from 903 to 1,208 unique keys and
  extended the governed commercial browser journey with Dutch form, decision, and
  estimate assertions plus an explicit English round trip.
- Localized the complete WBS/quantity-takeoff, labour-burden, overhead-recovery,
  estimating-rate policy, and unit-rate build-up surface in Dutch and English,
  including create, edit, remove, conversion, and policy dialogs. Operator-entered
  policy names, labour classes, work packages, descriptions, notes, and source
  references remain unchanged when the display language changes.
- Kept the expanded 903-key operator catalog out of the English startup path by
  loading it only when Dutch is active. The rejected eager implementation grew the
  main chunk to 582.29 kB; the corrected build is 531.51 kB and passes the bundle
  budget at 397,789 total gzip bytes.
- Extended the existing browser takeoff journey to prove Dutch rendering after a
  complete governed estimate conversion while preserving retained English project
  evidence. Focused and complete browser gates pass, including all 90 workflows in
  23 isolated batches.
- Added bounded tab-scoped draft recovery across central operator, field, and
  client-portal forms. Drafts are principal-scoped, expire after 12 hours, exclude
  secret-shaped fields/files, enforce per-entry/total limits, clear on sign-out,
  and cannot create a ledger record without explicit submission.
- Added the dedicated Vitest/Testing Library frontend gate and CI/release-contract
  enforcement. Six component/hook tests and a new Chromium reload workflow cover
  restoration, scope isolation, privacy limits, QA dialog behavior, no implicit
  ledger write, and intentional lifecycle clearing.
- The full browser run exposed and fixed overly broad selected-job recovery that
  reopened a workspace over explicit Today navigation. All 90 workflows now pass
  in 23 isolated batches, including the commercial and daywork reload regressions.
- Hardened Windows packaging for a running standalone preview: a locked bundled
  Node binary is reused only when its version exactly matches, while every other
  package artifact is cleaned and rebuilt. The refreshed package passed its full
  Node 22.23.2 runtime verification without stopping the existing preview.
- Gates at that checkpoint passed: 6 frontend tests, 532 Node tests, 90 Chromium workflows,
  zero dependency vulnerabilities, lint, release/build/bundle, maintained HAI
  parser, smoke and production performance, hardened container, and Windows
  standalone verification.
- Audited every retained request-supplied `...By` identity after approval-principal
  hardening. Internal creator, submitter, completer, releaser, and reviewer
  provenance now always prefers the trusted caller; external recipient, custodian,
  technician, inspector, and named-worker evidence remains distinct from the
  immutable audit actor.
- NCR closure now retains the named verifier and authenticated verifier principal
  together, hashes that principal into the pending decision, records it as the
  closing principal, and prevents that operator from approving the same closure.
- Pending closures from the preceding schema retain their original decision hash;
  replay is limited to the retained requester principal and an independent
  authenticated resolver can complete the upgraded closure.
- Extended the release source guard and domain/API regressions across progress,
  daywork, expenses, environmental reporting, assignments, meetings, controlled
  documents, worker instructions, and NCR closure.
- Current gates pass: 532 Node tests with 496 passes and 36 service skips, 89
  Chromium workflows in 23 batches, zero dependency vulnerabilities, lint,
  release/build/bundle, maintained HAI parser, smoke and production performance,
  hardened container, and rebuilt Node 22.23.2 Windows standalone verification.
- Canonicalized approval requester and resolver provenance. The trusted caller now
  wins before identity is persisted or reused by downstream releases, chained audit
  history, or independent-review checks; direct internal compatibility fallbacks
  remain available only when no trusted caller principal is supplied.
- Removed 65 residual route workflow-label fallbacks and bound those mutations to
  `local:owner`, the authenticated role principal, or `client_portal`. The release
  verifier now rejects both fallback routes and submitted-first approval principals.
- Added direct-ledger and local HTTP regressions proving submitted requester,
  resolver, and actor labels cannot enter the approval or audit record. The focused
  source, authentication, installation-QC, and photo-evidence set passes.
- The exact-source release gate passes with 530 Node tests, 89 Chromium workflows
  in 23 batches, zero dependency vulnerabilities, production build and bundle,
  native and maintained-parser HAI checks, smoke and 63,500-row performance,
  hardened container, and Node 22.23.2 Windows standalone verification.
- Normalized all 164 explicit HTTP mutation actor sites to the canonical trusted
  request principal. This closes the residual consistency gap in handlers that
  clone or reshape a parsed body before invoking the ledger.
- Extended the release contract to reject future request-body-derived actors and
  added API evidence that both intake and cloned-body equipment custody mutations
  ignore a spoofed owner label while retaining `local:owner` in chained history.
- The complete regression run exposed a sub-second work-permit fixture race under
  load. Permit creation, readiness, and approval expiry now honor the injected
  ledger clock; deterministic expiry coverage replaced the sleep, and all 527 Node
  tests pass with 491 local passes, 36 environment skips, and zero failures.
- The exact-source release gates pass: zero dependency vulnerabilities, 89 Chromium
  workflows in 23 isolated batches, production build and bundle budgets, native and
  maintained-parser HAI contracts, the 63,500-row benchmark, hardened container,
  Node 22.23.2 Windows standalone, and the smoke performance profile.
- Closed the remaining local-mode audit identity gap at the shared Express request
  boundary. Parsed object bodies now receive only `local:owner`, the authenticated
  role principal, or `client_portal`; submitted labels are non-enumerably replaced
  before any current or future ledger mutation route can consume them.
- Added an API and persisted-database regression proving a spoofed owner label does
  not enter either chained audit history or raw intake source JSON. Lint, dependency
  audit, release contract, production build, bundle/HAI contracts, all 527 Node
  tests, all 89 Chromium workflows, container runtime, Windows standalone, and the
  smoke performance profile pass.
- Replaced the final browser-native confirmation in the canonical dashboard with
  a lazy-loaded QA-maintenance dialog that previews exact server-derived counts and
  samples, requires a retained reason and exact phrase, traps focus, restores the
  initiating control, and contains loading, stale-plan, empty, and error states.
- Removed a 500-row maintenance blind spot by inventorying all eligible active QA
  records directly. The owner-only write now rejects changed or empty plans,
  independently verifies its backup, rechecks membership inside one transaction,
  and archives or retires records together with pending-approval rejection and a
  plan-hashed audit event.
- Focused Node/source tests and desktop/mobile in-app Browser checks passed. The
  isolated Chromium workflow proves axe, keyboard cancellation, successful focus
  restoration, backend state, mobile containment, and the empty follow-up state;
  the browser inventory is now 89 workflows.
- The full release gate passed with zero dependency vulnerabilities, 525 Node
  tests, 89 Chromium workflows in 23 isolated batches, production build/bundle,
  63,500-row benchmark, hardened container, maintained HAI parser, and Node 22.23.2
  Windows standalone. A final cancellation-race and audit-actor hardening pass was
  then rechecked by its focused Node, source, browser, lint, build, and bundle gates.
- Replaced the owner automation-stop browser prompt/confirm sequence with a
  lazy-loaded reason-and-acknowledgement dialog that traps focus, supports Escape,
  restores initiating focus, shows retained control context, and keeps API errors
  inside the decision surface.
- Added a complete browser workflow proving suspend persistence, scheduler refusal,
  command-plan refusal, cancellation focus restoration, accessible resume, and
  mobile containment. The browser inventory is now 88 workflows.
- The populated-state dialog scan exposed low-contrast secondary text in retained
  automation and audit rows behind the modal. Those dynamic row palettes now meet
  the same axe gate as empty-state Operations.
- Added a pinned axe WCAG A/AA release gate for production sign-in, all twelve
  owner workspaces, representative dialogs, mobile navigation, and the client
  portal at mobile and desktop widths.
- Fixed shared compact-text contrast in tables, schedule and crew planning,
  finance summaries, resource tabs, field assurance, onboarding, performance,
  framework, and client-portal surfaces without excluding any axe rule.
- The full browser release gate now passes 87 workflows in 22 isolated batches,
  including all four accessibility checks and the independent production sign-in
  scan in the authentication workflow file.
- Reconciled the HAI connector with the maintained HAI account-feed parser. The
  previous normalized shape omitted required `provider` and `itemType` fields;
  the export now emits `accountfeed.GenericItem`, rejects retired fields, and has
  native, Windows-package, CI, and optional actual-parser compatibility gates.
- Verified the generated fixture through maintained HAI `ParseGenericFeed` in an
  isolated network-disabled Docker Go runtime without changing the HAI checkout.
  Lint, dependency audit, release/HAI contracts, 525 Node tests, build/bundle,
  production-scale benchmark, container, Node 22 Windows package, 87 browser
  workflows, and retained-ledger
  startup all passed.

## 2026-08-09 - Privacy rights operations pass

- Added migration 071 and an owner-controlled register for client and worker
  access, rectification, erasure, restriction, portability, and objection requests.
- Added minimal identity-evidence references, calendar-month deadlines, bounded
  extensions with requester-notification evidence, live source inventories, legal/retention assessment references,
  independent source-current approval, and private checksummed JSON exports.
- Enforced restriction and direct-marketing objections in relevant new processing;
  rectification and blocker-aware partial pseudonymisation preserve immutable
  financial, contractual, safety, approval, and audit evidence.
- Wired diagnostics, operational export, backup/restore validation, hosted migration,
  PostgreSQL parity, capability reporting, and the Windows standalone smoke to the
  new lifecycle without claiming automatic disclosure or complete erasure.
- Added the responsive Operations register and verified the full release gate:
  zero-vulnerability production audit, lint, release contract, 524 Node tests,
  83 Chromium workflows, build and bundle budgets, production-scale benchmark,
  hardened container, live local readiness, and Node 22.23.2 Windows packaging.

## 2026-08-09 - Persistent owner onboarding pass

- Replaced the first-run redirect with a four-step owner setup workflow for legal
  identity, office/contact details, billing defaults, and readiness review.
- Persisted each completed step through the canonical organization ledger API;
  no browser storage, inferred business values, or weaker issue gate was added.
- Added keyboard escape/focus cycling, opener focus restoration, compact mobile
  progress controls, exact validation messages, and the existing Operations editor
  remains the complete post-setup maintenance surface.
- Browser-tested a fresh-ledger setup at 390x844 through server readiness and then
  verified the retained record in the desktop Operations editor.
- Split onboarding into lazy JS/CSS assets so normal dashboard startup does not
  pay for the owner-only first-run flow.
- The complete release gate passed: zero-vulnerability audit, lint, release
  contract, 509 Node tests, 81 isolated Chromium workflows, production build,
  bundle budget, container runtime, and a Node 22.23.2 Windows package smoke with
  ready storage, compact framework catalog, read-only HAI feed, and no key leakage.

## 2026-08-09 - Framework method playbook pass

- Added a validated operating playbook to every one of the 23 framework families:
  recommended scope, review cadence, evidence prompts, measure candidates, and
  safeguards.
- Added the method basis to the framework review dialog and a guarded starter that
  fills only missing review cadence and measures. It never retains suggested
  evidence as proof.
- Added an explicit compact-family representation for the dashboard, reducing its
  complete catalog response from 320,592 to 183,602 bytes while adding the
  playbooks. The default API retains the prior nested-guidance contract.
- Browser-tested the workflow at 1280x900 and 390x844 with no console errors, page
  errors, or horizontal overflow; the focused framework lifecycle test passed.

## 2026-08-09 - Governed framework implementation pass

- Parsed goal sections 1-23 into a deterministic ASCII-safe catalog containing
  23 families, 671 unique frameworks, and 700 family memberships.
- Added migration 069, scoped implementation records, immutable checksum-protected
  revisions, guarded transitions, exact replay, concurrency checks, diagnostics,
  backup validation, export, role APIs, and PostgreSQL parity coverage.
- Added the lazy-loaded Performance framework register with bounded pagination,
  search, family/status filters, evidence, measures, decisions, review dates, and
  revision history on desktop and mobile.
- Routed due framework reviews into the internal command plan and read-only HAI
  feed without adding autonomous execution or external commitment authority.
- The complete release gate passed: zero-vulnerability audit, lint, release
  contract, 509 Node tests, 80 isolated Chromium workflows, production build,
  bundle budget, Docker runtime migration 069, and Node 22.23.2 Windows package
  runtime/catalog smoke. Exact results and external boundaries are retained in
  `FINAL_VERIFICATION_REPORT.md`.
- Hardened the Windows launcher after runtime verification showed that repeat
  starts could retain the owner key in redirected logs. The key is now displayed
  only on first run, later starts report the protected configuration path, the
  exposed key was rotated, and the key-bearing local logs were cleared.

## 2026-08-08 - Giant prompt implementation pass

### Discovery

- Read all 124 PDF pages and visually reviewed contact sheets for every page.
- Mapped phases 000-115 to the maintained Node/React operating-ledger runtime.
- Counted 358 Express routes, 68 migrations after this pass, 153 test files, and
  81 direct API call sites in the main dashboard.
- Reviewed repository status and preserved unrelated tracked state; starting tree
  was clean at `d1a89fbc73be714b6cb05bb7fbf554309c3387ea`.

### Implementation

- Added migration 068 and transactional owner safety-control methods.
- Enforced suspension in autonomous cycles, scheduler claims, and command-plan
  application while preserving dry-run and direct human operations.
- Added owner-only control and support-bundle endpoints with explicit confirmations.
- Added the doctor CLI, runtime version/release reporting, retention readiness, and
  owner-only debug authorization.
- Added global/Operations UI controls and first-run identity guidance.
- Bumped the release to 1.1.0 and refreshed the lockfile to remove advisories.
- Added and updated migration, safety, scheduler, hosted-readiness, PostgreSQL parity,
  restore, and release-contract tests.
- Added the twelve audit and operator artifacts mandated by the prompt plus a
  changelog.

### Verification ledger

Focused safety/scheduler tests passed before documentation was added. The release
contract initially failed only because the mandated documents did not yet exist;
that was an expected test-first result.

The final local gates passed on 2026-08-09: lint, zero-vulnerability dependency
audit, release contract, production build, bundle budget, 501 Node tests, 79
Playwright tests, container runtime, isolated runtime doctor, and portable Windows
Node 22 x64 packaging. Exact counts and external boundaries are retained in
`FINAL_VERIFICATION_REPORT.md`.

### Completion work

- Added gzip/Brotli-compatible HTTP compression, immutable hashed-asset caching,
  deterministic Vite chunking, and enforced JavaScript/CSS/gzip budgets.
- Added a portable Windows launcher/runtime/package builder with private local data,
  loopback binding, health checks, and a desktop entry point.
- Added a loopback-only ngrok launcher that validates runtime readiness and refuses
  missing credentials or unsafe bindings.
- Added a read-only HAI manifest/feed/API/export contract with no write authority.
- Made browser execution isolated and bounded, then fixed stale-response and form
  interaction races in identity, material, briefing, permit, LMRA, environment,
  expense, and daily-cycle workflows.
- Updated Docker and CI to verify HAI export compatibility, current action majors,
  Windows packaging, PostgreSQL TLS parity, browser workflows, and container safety.
- The first publication run exposed an Operations hydration race that could replace
  the first business-identity field after input began. The form now remains natively
  disabled until its retained profile loads, and the browser test verifies the save
  response and persistent readiness state instead of relying on a transient notice.

### Scope decisions

- Did not enable real external delivery without credentials and acceptance evidence.
- Did not claim legal, tax, Wkb, safety, energy, Peppol, or GDPR certification.
- Did not split the three largest modules during a stabilization release; the debt is
  recorded for contract-protected incremental extraction.
- Did not introduce destructive automatic retention or data-subject erasure.

## 2026-08-09 - Production-scale ledger performance pass

- Added deterministic disposable smoke and production benchmark fixtures with
  canonical schema, foreign keys, valid SHA-256 audit chains, and one measured
  canonical intake write against retained scale.
- The production profile retains 63,500 core rows: 5,000 requests/jobs, 20,000
  tasks, 2,500 opportunities, 5,000 approvals, and 25,000 audit events.
- Fixed job/opportunity filtering after a 500-row window and replaced bounded
  in-memory opportunity forecasting with complete database aggregation.
- Profiled dashboard command generation and moved assignment and handover
  eligibility checks before expensive job-detail assembly.
- Packaged Node 22.23.2 measurement reduced dashboard p95 from 5,951.57 ms to
  620.83 ms; canonical intake p95 was 86.24 ms and every retained threshold passed.
- Added smoke contract tests, CI production gate/report upload, release scripts,
  operator guidance, acceptance outcome A27, and phase 051/052 completion evidence.

## 2026-08-14 - Practical-core bilingual workflow pass

- Passed the persisted operator locale through the ledger-backed Pipeline workspace
  into the ICP/service-area, bid/no-bid, and preconstruction site-survey controls.
- Localized interface actions, states, empty content, form labels, dialog copy, and
  accessible names while leaving retained policy, checklist, and evidence text intact.
- Extracted specialist translations from the eagerly loaded shell locale into a
  lazy shared catalog; the production base locale returned to 12.79 kB.
- Added an NL persistence round-trip, Dutch axe scan, site-survey locale interaction,
  and retained desktop/mobile containment checks to the production-bundle browser flow.
- Fixed the browser-discovered lowercase English site-survey status regression and
  reran the complete survey-to-estimating approval flow successfully.
- Final current-source gates pass: 10 frontend tests, 533 Node tests, all 90
  Chromium workflows, release/build/bundle, dependency audit, hardened container,
  and Node 22.23.2 Windows standalone verification.

## 2026-08-14 - Capacity and liquidity bilingual pass

- Passed the persisted operator locale into the crew-capacity/two-week planning
  board and the approval-backed 13-week cash-flow forecast.
- Localized forms, tables, summaries, empty states, approval actions, accessible
  names, and known system-generated blockers/warnings while keeping retained job,
  worker, source, and unknown provider text verbatim.
- Added structured crew blocker context so localized messages interpolate retained
  names, dates, and hours without parsing presentation strings.
- Added Dutch cash-flow reload persistence, an axe scan, crew-board locale checks,
  translation contracts, and structured blocker assertions.
- Current-source gates pass: 10 frontend tests, 533 Node tests in 333.5 seconds,
  all 90 Chromium workflows in 554.7 seconds, release/build/bundle at 388,474
  total gzip bytes, zero dependency vulnerabilities, HAI contract, production
  benchmark, hardened container, and Node 22.23.2 Windows package verification.

## 2026-08-14 - Field planning and safety bilingual pass

- Passed the persisted operator locale into Last Planner weekly control, office and
  field 5S, and the worker-owned LMRA workflow, including the nested Resources path.
- Localized static controls, known statuses, validation messages, offline notices,
  accessible names, and system outcomes while preserving user-entered promises,
  findings, hazards, evidence references, and retained standards verbatim.
- Added exact interpolation contracts plus Dutch-to-English browser round trips with
  reload persistence before completing the existing approval, corrective-action,
  live-LMRA, stop-work, and responsive mobile workflows.
- The operator catalog now has 754 unique case-sensitive entries with no duplicate
  keys and remains a lazy shared production chunk.
- Current-source gates pass: 10 frontend tests, 533 Node tests in 74.5 seconds, all
  90 Chromium workflows in 490.5 seconds, release/build/bundle at 394,091 total
  gzip bytes, HAI fail-closed contract, production benchmark, hardened container,
  and Node 22.23.2 Windows package verification.

## 2026-08-14 - Job setup and critical-path planning bilingual pass

- Passed the persisted operator locale into job setup coverage and work planning,
  including every ledger-generated capability label, autonomy boundary, baseline
  state, task action, dependency control, tooltip, and accessible name.
- Preserved retained job, task, assignee, and evidence text verbatim through a
  Dutch-to-English task-creation round trip and API readback.
- Fixed lowercase task priorities that remained English in Dutch mode and replaced
  the cramped four-column mobile job summary with a contained two-by-two layout.
- Removed a browser-suite batch-order assumption by verifying QA archive counts
  against the current complete server preview rather than a four-record constant.
- In-app Browser QA confirmed localized setup/planning copy, retained mixed-language
  task titles, exact mobile containment, and zero inspected console errors.
- Current-source gates pass: 10 frontend tests, 534 Node tests (498 passed and 36
  PostgreSQL/environment skips), all 94 Chromium workflows in 24 isolated batches,
  2,495 unique operator translation keys, release/HAI/lint/build/bundle at 434,974
  total gzip bytes, the 57,500-row production benchmark, hardened container, and
  Node 22.23.2 Windows standalone verification.

## 2026-09-06 - Approved operator dashboard redesign

- Added graphite grouped navigation, a light shared operator design system,
  truthful open-job metrics, and a same-day agenda based only on scheduled starts.
- Grouped existing dossier controls into keyboard-accessible sections. Controls
  remain mounted during section changes so unsaved input survives; original role
  checks and the all-sections view remain intact.
- Improved mobile navigation, touch targets, table scrolling, focus indicators,
  reduced-motion behavior, and full-height mobile dossiers. Client and offline
  shells retain their independent layouts.
- Preserved pre-existing uncommitted work and operator data. No provider actions,
  commits, pushes, or deployment changes were performed for this redesign.
- Verified 31 frontend tests, 36 targeted dashboard/static Node tests, lint,
  production build, release contract, and bundle budget (497,252 total gzip bytes).
  The complete backend suite, container and Windows package were not rerun.
- Browser verification and screenshot review are recorded in
  `docs/superpowers/plans/2026-09-05-dashboard-overhaul.md`.

## 2026-09-06 - Local worker registration and self-service positions

- Added a separately authenticated mobile worker board at `/work-board.html`.
  New applicants register contact details and trades; owner admission creates a
  ledger worker, while pending applicants can retain expressions of interest.
- Added owner admission/suspension in Beheer and reviewed position publication
  in project dossiers. Existing tasks can prefill drafts; missing scope, dates,
  trades and rates are not invented by an AI model.
- Published positions retain city, period, hours, capacity, compensation and
  requirements. Enrollment is transactional and replay-safe, checks current
  worker trades, qualifications, availability and capacity, and creates only
  an internal planned assignment. Assigned workers get a scoped read-only pack.
- Added migration 073, standalone runtime files, restore schema verification,
  and suspension of restored/imported applicant accounts. Login responses omit
  internal admission notes; suspension revokes current sessions.
- Documented public-launch limitations in `docs/WORK_BOARD.md`. The new API is
  disabled by default in hosted/production mode. There is no external provider
  activation, automatic replacement, password recovery or privacy-workflow
  integration in this increment.
- Preserved prior uncommitted work and the operator ledger. A database-only
  safety snapshot at `tmp/before-work-board-20260906.sqlite` passed SQLite
  integrity verification. The built-in signed backup was unavailable because
  its signing key was not configured; the snapshot is not a full evidence backup.
- Found and fixed whole-person input validation, withdrawn-trade enrollment,
  and internal admission-note exposure during verification. Browser checks use
  disposable ledgers, never synthetic records in the operator database.
- Verification results are recorded in
  `docs/superpowers/plans/2026-09-06-work-board.md`. No commit, push or deployment.

## 2026-09-12 - Total-solution company boundary foundation

- Retained the complete accepted scope in `docs/TOTAL_SOLUTION_DELIVERY.md`.
  This increment does not complete shared identity, memberships, multi-resource
  planning, disruption recovery, external mandates or production deployment.
- Created a checksummed source/database/uploads checkpoint before edits. A fresh
  migration of its SQLite copy preserved all 156 prior business tables, with
  integrity `ok`; the checkpoint remains local and unencrypted.
- Added migration 074 and immutable company/ledger runtime identity, private
  directory binding, company-specific sessions, stale-page API and native
  download assertions, and backup/restore/migration ownership checks. Hosted
  startup and migration refuse missing or foreign company storage scope before
  external initialization.
- Separated encrypted offline folders and queued responses by company, ledger
  and operator. Older unscoped drafts remain quarantined, not deleted or silently
  adopted. AI/chat operations, private photos, exports and document links now
  use the same browser destination checks.
- The broader UI audit found a squeezed finance detail column and low-contrast
  cost descriptions. Moved actions below the full-width details, made numeric
  columns responsive and kept mobile actions readable. Added layout assertions
  and retained axe checks. Updated stale Today selectors, download expectations
  and the old subject-form test to exercise the actual customer conversation.
- Fixed mobile action-column overflow in production entries and task dependency
  rows while preserving 44px touch targets. Made planning dates relative and
  test languages explicit, without weakening the retained workflow assertions.
- Added an accessible product error boundary with manual reload after a failed
  module load. It does not expose raw error details, erase browser storage or
  automatically replay writes. Recovery of unsaved input is not guaranteed.
- Local Node (587 passed, 37 PostgreSQL-dependent skips), PostgreSQL TLS,
  existing-data migration, 36 frontend tests, all 113 unique browser workflows,
  production-profile performance and 13 delivery checks passed. Browser proof
  spans isolated batches and targeted reruns; failure logs remain available.
- Rebuilt and smoke-tested the Windows package, including migration 074 and
  company boundaries. The final non-root/read-only container passed authenticated
  startup, volume persistence, restart and graceful shutdown. External provider
  acceptance is not inferred from these tests or their test doubles.
- Automatic startup of the existing local preview was denied by execution policy.
  Its original database remains unchanged; no preview or operator migration is
  claimed. Full evidence and remaining phases are in the delivery register.
- No commit, push, provider activation, public deployment or changes to the shared
  Hetzner server. Registry/OIDC and controlled membership/recovery are next.

## 2026-09-12 - Personal identity and company membership

- Added an optional registry separate from every company ledger, with durable
  SQLite/PostgreSQL storage, encrypted OIDC records, stable signing keys and an
  admission audit chain. Existing company keys remain independent recovery access.
- Implemented registration, one-time recovery codes, invitations, separate owner
  admission/revocation and a company switcher. The OIDC code flow uses maintained
  provider/client libraries, PKCE, state, nonce and current-membership checks.
  Person IDs, memberships and reviewed worker profiles are not inferred from email.
- Added explicit legacy work-board conversion preserving account/application IDs
  and invalidating its old password/bearer access. Fixed stale browser-session
  startup races, canonical worker fields and bound-link reassignment checks.
- Migration 075 retains encrypted company identity sessions and login flows.
  Backup restore and hosted migration clear them, rather than reviving access.
  Wrong registry/company database markers, issuer/key/origin and partial runtime
  configuration fail closed; confidential callbacks are omitted from request logs.
- Added real registration/admission/SSO/recovery browser coverage at desktop and
  phone sizes, accessibility checks and targeted uncertainty/security tests.
  Preserved legacy API response shapes after contract tests found additive-field
  compatibility regressions.
- Updated dependency locks to resolve five reported advisories; the final audit
  reports zero known vulnerabilities. Raised only the total compressed bundle
  budget to 520,000 bytes and added a 10,000-byte identity-assets budget. Actual
  total is 514,801; identity assets are 6,961 compressed bytes.
- Found and corrected the container healthcheck's fixed ledger-only destination.
  Both actual Windows and container distributions now test separate identity
  startup, OIDC discovery and signing-key persistence across restart. Health
  probes check storage without relaxing account-route origin checks. Private
  company binding files are excluded from the Docker build context.
- Verified 596 local Node passes with 38 PostgreSQL skips, then 19 focused passes
  after final hardening; 40 PostgreSQL contract passes plus a final registry
  rerun; 39 frontend passes; nine focused browser workflow passes; lint, production
  build, bundle/release/HAI contracts and both distribution smoke tests.
- A fresh migration copy preserves all prior business-column values across 156
  tables. All 157 original database tables remain unchanged. Verification uses
  disposable databases; test containers/volumes were cleaned up.
- Full evidence is in `docs/TOTAL_SOLUTION_DELIVERY.md`; setup and exact remaining
  recovery/hosting gates are in `docs/IDENTITY_AND_MEMBERSHIP.md`. This does not
  complete phase 2, resource planning, autonomous external mandates or the goal.
  No commit, push, operator restart, real identity activation or provider action.

## 2026-09-12 - Registry recovery, key rotation and assisted account recovery

- Added registry migration 002, independent from company ledger migration 075.
  Encrypted recovery snapshots retain people, company relationships and audit
  history, excluding passwords, recovery/session tokens and OIDC credentials.
- Added privileged maintenance commands for status, exact-person lookup, backup,
  verification, new-database restore, current-checkpoint key rotation, assisted
  recovery and cancellation. Keys and recovery codes never appear in CLI receipts.
- Restore requires the original registry/issuer, a fresh key and an empty target.
  It creates fresh company secrets and suspends memberships instead of reviving
  access. Incomplete targets remain unready; uncertain outcomes retain evidence.
- Assisted recovery requires independent person/channel verification references.
  A private thirty-minute code resets credentials once without granting company
  membership. Issuance does not lock an account; cancellation, expiry, replay,
  supersession and concurrent redemption are covered.
- Key rotation revokes sessions/signing state, open invitations and assisted
  codes, while preserving personal passwords and memberships. Old replicas fail
  readiness/writes. A changed checkpoint or unsupported metadata refuses rotation.
- Added CLI and recovery guides to Docker/Windows distributions and verified
  actual packaged backup/verify/restore, alongside startup and restart persistence.
  Windows rebuilds now refuse recognized operator data/private config before
  deleting generated output; use durable private directories outside the package.
- Verified 604 local Node passes with 39 PostgreSQL skips; two TLS PostgreSQL
  registry contract/recovery passes; 40 component passes. Earlier recovery-test
  cleanup failures were Windows SQLite handle ordering, corrected and rerun;
  failed logs remain available, not counted as successful verification.
- Seven targeted browser workflows and 21 final recovery/configuration/delivery
  tests passed, plus lint, production build and release/HAI/bundle contracts.
  A fresh copy passed migration 075 while all 157 original operator tables remain
  unchanged. Bundle use is 514,820 gzip bytes; no budget increases in this increment.
- Full evidence is in `docs/TOTAL_SOLUTION_DELIVERY.md`. Human identity checks,
  actual Windows ACL/key-store controls, provider recovery drills and authoritative
  handover are not established by fixture tests. The wider goal remains open.
  No original operator runtime started, no commit/push or provider activation.

## 2026-09-12 - Governed company handover and anti-rollback controls

- Added migration 076, independent environment keys, frozen/staged/retired write
  fences and a separate hash-chained authority history. Source retirement releases
  only the exact verified target, company, transfer and generation.
- Added stopped-runtime CLI procedures for keys, target description, freeze,
  package, retained output export, source retirement, activation and abort. The
  source high-water marker blocks stale DB recovery, including corrupt-target
  restore; failed source commits can require reviewed repair rather than rollback.
- Integrated the existing SQLite-to-PostgreSQL importer with signed permits and
  verified target receipts. Lost commit acknowledgment now retains both evidence
  and possibly committed rows. Generic restore refuses authority-bound data.
- Corrected capability status and desktop/mobile recovery controls; source keys
  stay outside packages, with an optional read-only hosted Compose secret mount.
- Verified 614 local Node passes with 40 PG skips, all 62 PostgreSQL checks plus
  six final operations/readiness reruns, 40 component tests and nine browser flows.
  Windows and Docker artifacts passed actual command/runtime smoke tests. The
  production performance fixture and release/HAI/bundle contracts passed.
- Fresh copied-fixture migration preserves 156 prior business tables' columns;
  all 157 original operator tables remain unchanged. See the delivery register
  for exact logs, scope and remaining recovery/offline/hosting gates. No original
  runtime was started, no commit/push and no real provider was activated.

## 2026-09-12 - Shared work dossier foundation

- Added migration 077 and a separate shared-work model for reusable physical
  locations, job parties and packages linked to retained tasks/measurements.
- Added office create/edit/archive/restore/export, scoped field/offline context,
  reviewed package-version position binding and dossier-review source tracking.
- Preserved private contacts, approval boundaries, original job addresses and
  existing placements. Context commands are source-checked and replay-safe;
  new tables retain SQLite/PostgreSQL native authority fences.
- Fixed hosted empty-target seed recognition and guarded deletion of linked
  takeoff items. Withdrawn contact information is not echoed in old read receipts.
- Local Node: 620 passes / 41 PG skips; selected PostgreSQL contracts: 41 passes;
  frontend: 44 passes; browser: five real office/mobile/offline workflows passed.
  Actual rebuilt Windows/Docker packages passed migration 077 and runtime checks.
- Fresh fixture migration preserves 156 old business tables' columns; all 157
  original operator tables remain unchanged. Full evidence, bundle-budget change
  and remaining lifecycle/planning/recovery work are in the delivery register.
- No original preview restart, commit, push, deployment or provider activation.

## 2026-09-12 - Independently evidenced partial work deliveries

- Added migration 078 and retained portions of existing work packages, backed by
  whole production entries/completed tasks rather than duplicate measurements.
  Active allocation is unique; reviewed corrections preserve the old record.
- Connected independent execution, linked inspection, reviewed customer-response
  and invoice/payment states. Approval resolution rechecks locked sources and
  evidence; pending payments and credits are not misrepresented as money received.
- Added office forms/history/export, targeted approval refresh without closing
  other drafts, and operational-only online/encrypted-offline worker summaries.
- Closed the assigned-field document path for private delivery-response evidence.
  Acceptance evidence is private from creation or first use, including rejected
  requests. Existing downloaded copies cannot be remotely erased. Drawings cannot
  be repurposed as private acceptance evidence.
- Added exact replay receipts, concurrent PostgreSQL checks, company-authority
  guards, dossier-review integration and backup/transfer integrity verification.
  No automatic contractual closure, safety release or external message is implied.
- Verified 627 local Node passes with 42 PostgreSQL skips, then 84 final focused
  passes; 42 selected PostgreSQL passes; 48 frontend passes; four real browser
  workflows. Lint, production build, release contract and bundle checks passed.
  Actual rebuilt Windows/container runtimes passed migration 078 and the packaged
  delivery/handover fixture. Test doubles are not live-provider acceptance.
- Fresh fixture migration preserves 156 prior business tables' existing values;
  all 157 original operator tables remain unchanged. The original runtime was
  never started. Evidence and remaining phase 2-10 scope are in the delivery
  register; operator/developer guidance is in `docs/WORK_DELIVERIES.md`.
- No commit, push, public deployment, customer communication or provider action.

## 2026-09-12 - Installed assets and connected maintenance history

- Added migration 079 for persistent installed-component identity, source-backed
  service history, atomic replacement pairs and retained corrections across jobs.
  A replacement does not overwrite the old component's serial identity.
- Connected existing warranty, aftercare and recurring plans. Maintenance
  preparation creates unassigned asset work packages and reuses an unfinished
  preparation only when its linked asset scope still matches. No visit, spend,
  external message or safety release is authorized by these records.
- Added office history/forms/export/source navigation and operational-only field
  summaries in online and encrypted offline packs. Private evidence stays private
  after correction; sharing can be withdrawn from an archived source dossier.
- Added source-change review, exact retry receipts, concurrency protection,
  SQLite/PostgreSQL authority guards and backup/transfer verification. Packaged
  Windows/container handover fixtures now create and reopen asset history too.
- Final local Node run: 635 passed, 43 PostgreSQL skips, zero failures. Selected
  PostgreSQL contracts: 41 passed, followed by two overlapping final asset/replica
  checks. Frontend: 53 passed; browser: four desktop/mobile/offline flows passed.
  Lint, production build, release/bundle checks and actual Windows/container smoke
  tests passed. The delivery register records precise logs and the explicit bundle
  budget change; environment skips and earlier failed runs are not passes.
- Fresh copied-fixture migration preserves 156 prior business tables' values;
  all 157 original operator tables remain unchanged. The original runtime was not
  started. See `docs/INSTALLED_ASSET_HISTORY.md` and the delivery register for
  workflow boundaries and remaining phase 2-10 acceptance gates.
- No commit, push, deployment, customer communication or real provider action.

## 2026-09-12 - Reviewed inspection coverage for partial work

- Added migration 080 for immutable control plans and complete evidence mappings
  on retained deliveries. Distinct authenticated principals review both; this
  does not verify separate physical people or professional competence.
- Revalidate physical scope, approval content, checklist integrity, current
  installation-QC references, corrective observations and evidence metadata.
  Plan revisions require fresh coverage; no safety, client or payment release
  follows automatically. Source changes create internal dossier-review issues.
- Connected office editing, readable approval previews, history/export and
  operational-only online/encrypted-offline worker instructions. Fixed stale
  adjacent delivery status after manual refresh, with browser regression proof.
- Added exact retry receipts, concurrent PostgreSQL checks, private evidence
  boundaries, native authority guards and backup/transfer verification. Actual
  Windows/container handover fixtures now retain and reopen coverage records.
- Final checks: 643 local Node passes with 44 PostgreSQL skips; 42 selected
  PostgreSQL passes; 58 frontend passes; four real desktop/mobile/offline browser
  flows. Lint, production build, release/bundle checks and actual packaged runtime
  smoke tests passed. Earlier failed fixtures/selectors are not counted as passes.
- Fresh copy migration preserves prior values in 156 business tables; all 157
  original operator tables remain unchanged. The original runtime was not started.
  See `docs/INSPECTION_COVERAGE.md` and `docs/TOTAL_SOLUTION_DELIVERY.md` for precise
  evidence, the explicit bundle-budget change and remaining phase 2-10 scope.
- No commit, push, deployment, customer communication or real provider action.

## 2026-09-13 - Client responses connected to partial delivery and photo chat

- Added migration 081 for scoped, versioned client offers, retained responses and
  exact command receipts. Public scope, recipient, private authority basis,
  expiry and already-visible conversation photos require publication approval.
- Added mobile Dutch/English customer responses with optional private photo
  upload, inbound chat provenance, private evidence and the existing delivery
  review. Explicit office verification is required; identity, signature, safe
  use, payment and whole-job closure are not inferred from the response.
- Connected office history/export, readable approval previews, client chat and
  adjacent delivery refresh. Corrected the answered-state label. Mounted drafts
  and uncertain retries retain input; browser-exit recovery is not claimed.
- Enforced access, scope, source and photo checks, transactional rollback,
  concurrent claims and SQLite/PostgreSQL authority guards. Quarantined proof
  makes current evidence stale without erasing the reviewed customer statement.
- Extended backup and real hosted transfer verification. Sealed review text and
  conversation provenance stay unchanged even when their text equals a moved
  file's old storage reference. Actual document storage pointers still rebind.
- Final checks: 653 local Node passes with 45 PostgreSQL skips; 44 selected
  PostgreSQL passes plus four overlapping final client/handover checks; 65
  frontend passes; six real desktop/mobile/offline browser flows. Lint, build,
  release/bundle checks and actual Windows/container runtime smoke tests passed.
  The full delivery register records exact logs, test doubles and budget changes.
- Fresh copy migration preserves prior values in 156 business tables; all 157
  original operator tables remain unchanged. The original runtime was not started.
  See `docs/CLIENT_DELIVERIES.md` for operation and privacy boundaries; phase 3 and
  the wider phase 2-10 recovery, planning, mandate and release scope remain open.
- No commit, push, deployment, real customer communication or provider action.
# 2026-09-23 - Work balance allocation and remaining scope

- Added migration 082: immutable, versioned work-allocation plans and exact
  idempotent command receipts, protected by the company authority guards.
- Connected the approved production basis to package allocations, source-bound
  separate approval, recorded production and current partial-delivery allocation.
  Unallocated output, changed sources, pending corrections and scope mismatches
  prevent a new selectable position from being published.
- Added a restricted remaining-quantity field projection and a Dutch office
  interface with exact-total validation, review submission, safe retry, history
  and export. Estimates are explicitly not a schedule or date commitment.
- Added backup integrity verification and Docker/Windows runtime packaging.
- Added local domain/API/frontend tests. Final verification and delivery evidence
  are recorded in `docs/TOTAL_SOLUTION_DELIVERY.md` and the 2026-09-24 entry
  above. No live operator database, provider, deployment or customer
  communication was used.

# 2026-09-24 - Approval-governed workforce replacement

- Added an explicit replacement request from availability conflicts. It records
  the candidate, original-assignment snapshot, conflicting period and reason in
  the existing assignments and approvals ledger.
- Approval revalidates both workers, the full original snapshot, capacity,
  qualifications and attendance. A single transaction releases the original
  and activates the replacement; rejection or a stale proposal leaves the
  original untouched. Authenticated hosted approvals enforce a different
  approver; local owner workflow remains usable with its one trusted identity.
- Added the Dutch request dialog, API route, transactional/unit/API tests and
  mobile browser coverage. No migration or external message is involved.
- Focused ledger/API tests and lint/build passed. PostgreSQL proof is not
  available because no PostgreSQL test URL was configured. Full Node suite:
  709 discovered, 663 passed, 46 PostgreSQL-only skipped, zero failures;
  frontend: 67 passed; selected mobile browser flow passed. Release and bundle
  checks passed (548,944 / 549,000 gzip bytes). Original operator database was
  not started or modified. Nothing was committed, pushed or deployed.

# 2026-09-24 - Coordinated workforce replacement plan

- Added one complete recovery plan for an availability period that affects
  multiple assignments across jobs. Every affected assignment requires an
  explicit qualified replacement; one portfolio approval controls the whole
  plan.
- Revalidate the complete conflict set, original snapshots, availability,
  proposal links, candidate readiness, overlapping candidate work and open
  attendance before committing. All assignment changes occur transactionally;
  rejected, stale or failed plans keep existing coverage intact. Exact retries
  return the same pending approval.
- Connected the plan to the responsive resources UI and approval decision
  preview. Kept individual replacement requests intact; no external
  communications or schedule commitments are triggered.
- Verification: focused Node ledger/API tests 13 passed; frontend tests 67
  passed across 19 files; the two-job Chromium flow passed at 390px; changed
  files passed ESLint; production build passed. Bundle measured 549,796 gzip
  bytes. The overall cap was adjusted from 549,000 to 551,000 bytes to allow
  this addition; per-asset caps remain unchanged.
- PostgreSQL verification is unavailable because no test URL is configured.
  The local operator database was not touched. No commit, push, or deployment.

# 2026-09-24 - Material-aware work-plan scheduling

- Work-plan tasks can link to same-job material requirements. Uncovered
  quantities block the internal plan unless a referenced expected availability
  date is retained; verified stock can be recorded as zero or partial.
- Schedule calculation shifts affected tasks to the retained ETA and pushes
  that shift through finish-to-start dependencies. Material state and its source
  are included in the planning hash, so approval cannot apply stale dates.
- The plan labels ETA-based schedules as estimates. No order, supplier contact,
  external schedule commitment, or customer promise is created.
- Verification: 12 focused Node/API regressions passed, including linked
  material ownership, unavailable-material blocking, ETA propagation, and stale
  approval rejection. Frontend tests: 67/67. Both work-plan Chromium flows
  passed. Changed JavaScript passed ESLint; Vite production build passed.
- PostgreSQL remains unverified without a configured test URL. The original
  operator database was not touched. No commit, push, or deployment.
- Bundle budget passed at 550,647 / 551,000 gzip bytes; individual asset caps
  also passed.

# 2026-09-24 - Change-impact analysis to formal variation

- Connected only a current, retained, audit-verified dossier impact analysis to
  the formal variation workflow. Proposed contract price and calendar days are
  separate explicit operator inputs; the elapsed-hour schedule scenario is not
  converted into a contractual date.
- The variation snapshot stores an evidence reference to the exact impact
  review and source hash. Stale source, incomplete schedule, mixed-currency
  analysis, invalid audit integrity, and duplicate/conflicting requests fail
  closed. One analysis can create at most one variation draft.
- Internal approval, client issue-package approval, verified delivery, client
  acceptance and work authorization remain separate. The generated draft alone
  authorizes no work and produces no external communication or commitment.
- Verification: 24 focused Node/API/security/change-order tests passed; the
  end-to-end dossier-review-to-variation flow passed; changed-file ESLint
  passed. Hosted PostgreSQL and provider delivery remain unverified.
- Frontend regression suite passed 67/67. Production build passed. Aggregate
  gzip measured 551,654 bytes; the limit moved from 551,000 to 552,000 to
  accommodate the governed variation UI, with individual asset limits intact.
- No local operator DB changes, commits, pushes, or deployments.

# 2026-09-24 - Accepted variation context in field work packs

- Connected integrity-valid, client-accepted formal variation scope to the
  assigned worker's versioned work pack. Private prices, internal risk and
  justification fields, and portal evidence references are not projected.
- Rechecked formal variation rows against every immutable snapshot field before
  treating them as intact. Corrupt accepted scope is withheld and surfaced for
  office review; a scope revision changes the field-pack source hash and makes
  an earlier worker read confirmation stale.
- The pack does not create or replan tasks, materials, assignments, dates, or
  orders. Those operational records remain separate and the UI says so.
- 29 focused Node/API/role/integrity tests passed; 73 API, integrity, and
  backup/restore tests passed; full frontend suite passed 68/68; field-pack
  mobile browser flow and repository ESLint passed.
- Production build passed at 552,040 total gzip bytes. The aggregate budget is
  553,000 bytes for both the governed variation authoring and field-scope
  context additions; per-asset caps are unchanged.
- No operator DB, provider, deployment, commit or push was used.

# 2026-09-24 - Joined workforce absence and material readiness impact

- Availability conflicts now include a source-derived impact snapshot from the
  affected job's current task graph and material requirements: missing quantity,
  directly linked tasks, schedule material blockers and task windows where a
  plan can be calculated.
- The availability operator view shows material shortfalls alongside absence
  conflicts and retains existing approval-gated replacement behavior. A
  replacement proposal does not clear material blockers or authorize dispatch.
- Material receipt impact remains on discrepant receipt records after an
  autonomous internal review task is created; the receiving and availability
  surfaces share one compact bilingual presentation.
- Focused Node/API suites passed, the material-impact component test passed,
  and all three workforce-availability Chromium flows passed. Targeted ESLint,
  Vite production build and the bundle gate passed at 557,998 / 558,000 gzip
  bytes.
- No explicit client-date commitment was inferred. Persistent cross-job
  incident ownership, feasible shared-resource optimization, provider action,
  PostgreSQL rerun, deployment, commit and push remain unverified/not done.

# 2026-09-24 - Approved variations produce reviewed execution plans

- Added an idempotent request flow that converts only an integrity-valid,
  client-accepted and delivery-verified formal variation into bounded work
  steps with task-linked material requirements.
- The implementation approval captures hashes for the accepted variation,
  package and acceptance evidence, and current job tasks/materials/dependencies.
  Any stale source, concurrent job-state change or plan tamper blocks approval
  atomically. Authenticated requests require a different approver.
- Approval creates open tasks without assignees or dates and material records
  with `needed` status, no supplier, price, or required-by date. No schedule,
  dependency, procurement, communication or commitment is activated.
- Added a contractor-dossier editor, explicit safeguards and a reviewer summary
  listing work steps and their linked material needs. Dutch translations and
  responsive form behavior are included.
- Focused backend and API tests passed 4/4; focused frontend tests passed 2/2; full
  frontend suite passed 70/70; repository ESLint passed. Vite build passed.
- The full Node run had 673 passes, 46 environment-skipped tests and one stale
  browser inventory assertion. After updating its discovered count from 122 to
  124, the focused static inventory tests passed. PostgreSQL tests were not run.
- The gzip bundle measured 553,970 bytes; aggregate cap adjusted to 555,000 for
  this separately approved execution workflow, with all per-asset caps intact.
- No operator database, provider, deployment, commit or push was used.

# 2026-09-24 - Approved variation tasks enter reviewed positions

- Connected only approved, accepted variation implementation tasks and their
  exact linked material needs to the office position suggestions. The form
  leaves role, dates, rate and release confirmation for the operator.
- Revalidated plan checksum, applied task/material records, acceptance chain
  and current variation snapshot at both suggestion and publication time.
  Altered source metadata after opening the form now fails closed at release.
- 11 focused Node tests passed; full frontend suite passed 71/71; repository
  ESLint passed; production build passed with 554,014 gzip bytes under the
  555,000-byte aggregate cap.
- No automatic public release, business DB, provider, deployment, commit or
  push was used.

# 2026-09-24 - Material readiness gates work-board placement

- A worker can still express interest in a position with linked materials
  outstanding, but that interest no longer consumes capacity or creates a
  planned assignment. Public position cards explain the hold.
- The office sees pending applicants and exact linked material blockers. Owner
  confirmation is enabled only after all required quantities have verified
  ready statuses; placement rechecks current task source, admission, trade,
  qualifications, availability, schedule conflicts and capacity.
- Material-ready self-enrollment and owner confirmation both converge on one
  planned assignment; confirmation is idempotent. Existing dispatch/start gates
  continue to apply if conditions later change.
- Full Node suite passed 676/676 with 46 PostgreSQL tests skipped (no database
  configured); frontend passed 73/73; lint and production build passed. Bundle
  measured 554,560 gzip bytes, within the 555,000-byte limit.
- No operator DB, provider, deployment, commit or push was used.

# 2026-09-24 - Worker-reported unavailability joins planning

- Added a self-scoped availability report to the admitted worker portal. It
  records only a time window or unknown-return review date, not a reason or
  medical details. Legacy sessions and reviewed identity memberships resolve
  the worker; submitted worker IDs are ignored.
- The worker can see only their own overlapping active assignments. Those
  conflicts appear in the existing office availability/replacement planner;
  no assignment is changed and replacement remains approval-gated.
- Full Node suite passed 676 tests with 46 PostgreSQL skips; frontend passed
  74/74; focused mobile Playwright flow, lint, production build and bundle
  verification passed. Gzip is 555,632 bytes under the 556,000-byte cap.
- No operator DB, provider, deployment, commit or push was used.

# 2026-09-24 - Incident follow-up ownership and closure evidence

- Incident reports now retain an optional office follow-up owner and due date.
  Field-worker API submissions cannot assign those office-only fields.
- Incident resolution requires a review note and documented corrective action;
  high-risk records continue through the existing approval gate. The office
  review form records that corrective action, and resolved details remain on
  the incident.
- Added API coverage for owner/deadline persistence, rejection of unsupported
  resolution, and field-role spoofing. Full Node suite, frontend suite (79/79),
  offline field-risk browser flow, full ESLint, production build and bundle gate
  passed. PostgreSQL-provider acceptance was not available without a test DB.
- Cost-forecast snapshots now expose their retained approval metadata in the
  mapped API record; the autonomous-finance regression test covers the shape.
- The aggregate gzip gate is 558,200 bytes, increased by 200 bytes for this
  workflow; per-surface caps remain unchanged. No provider, operator DB,
  deployment, commit or push was used.

## 2026-09-24 - Source-bound disruption recovery cases

- Added migration 084 and an operational recovery ledger that combines active
  worker absence/conflict, discrepant delivery, and unresolved safety records
  without replacing the underlying evidence registers.
- Cases retain an owner, explicit due time, a recovery direction and current
  source snapshot; stale sources are rejected. Resolution requires evidence.
- Added an office-only dossier control and API. Customer-date review is
  explicitly required before any change; no customer or supplier communication,
  purchasing, assignment, schedule mutation or external commitment is triggered.
- Added SQLite backup integrity checks, hosted JSON-column preservation,
  Windows runtime inclusion, role/API tests, ledger tests and UI tests.
- Verification: focused ledger/API and static performance suites passed; the
  frontend suite passed 81/81; lint, production build and bundle verification
  passed (561,005 gzip bytes of 561,200); the operational-recovery browser flow
  passed. Container acceptance passed with migration 084, and the Windows
  standalone verification passed with no pending migrations. The complete
  Node suite also passed. PostgreSQL is not configured; live deployment/provider
  acceptance, commit and push are outside this work.
- The aggregate gzip cap increased by 3,000 bytes to 561,200 to include the
  recovery control; per-surface bundle limits remain unchanged.

## 2026-09-24 - Native field progress meets the shared work-pack ledger

- Added assigned-worker-only, source-bound progress/blocker reporting to the
  work-pack API and the native Android work-pack screen. Reports use the
  existing ledger progress records; the encrypted local queue synchronizes
  exact retries and keeps source conflicts visible. Completion is refused for
  field workers.
- Work-pack revisions no longer change solely because the job/task execution
  status advanced, so multiple queued reports from one instruction revision
  remain valid. Instruction/resource/scope changes remain source-bound.
- Focused work-pack API, work-pack behavior and progress replay tests passed
  (10/10); the complete Node suite, repository lint and release-contract scan
  passed, and the mobile work-pack Chromium flow passed. Android APK
  build/device acceptance could not run: this environment has neither an
  Android SDK nor JDK/Gradle. No provider, deployment, commit or push was used.

## 2026-09-24 - Reviewed client findings create internal RFI follow-up

- Connected current local-analysis findings to the existing project RFI register.
  Owner/office users can review and edit the RFI title/question, set its owner and
  future due date, and retain the exact inbound message, quote, analysis identity,
  proposal and uncertainty as provenance.
- The route rechecks conversation access and current analysis/message state inside
  the ledger transaction. Exact retries return the same RFI; a reused key with
  changed content or an out-of-date analysis is rejected. It cannot publish a
  client reply or alter scope, price, schedule or assignments.
- The real conversation API test used a loopback model fixture and passed access,
  provenance, replay, changed-payload and stale-conversation checks. Conversation
  analysis/unit/API tests passed (9/9); the new frontend workflow test passed
  (4/4 for the conversation component file); the full frontend suite passed
  82/82. The complete Node suite, ESLint, Vite production build and release
  contract scan passed. Live local-model quality and provider acceptance remain
  separate.

## 2026-09-24 - Offline field progress reports in the web work folder

- Extended the encrypted PWA work-folder queue to retain source-bound progress
  and blocker reports using the existing ledger progress endpoint. The form
  validates status, percentage and note; the queue explicitly distinguishes a
  saved-on-device report from one received by the office.
- Added unit coverage for invalid payloads, company isolation, stable retry keys,
  stale-source conflicts and exact synchronization route/body; expanded the
  mobile browser flow to reload and unlock the saved work pack with the network
  disabled, then verify offline retention and company separation.
- Verification: focused offline-vault tests passed (2/2), mobile browser test
  passed, repository lint passed, complete frontend suite passed (82/82), and
  the complete Node suite passed (686 passed, 46 environment-dependent skips).
  Native Android remains source-only and is not required for this browser
  workflow.

## 2026-09-24 - Field blocker reports feed office recovery

- Connected source-bound blocked progress reports from the field work pack to
  the office operational-recovery source list. Office users can retain them in
  an owned recovery case alongside other disruptions; evidence-backed case
  resolution removes the report from active blockers while preserving its
  original source and history. It never sends a customer/supplier message or
  changes schedule, assignment or safety state.
- Added domain/API tests and extended the desktop/mobile browser flow to submit
  a field blocker through the authenticated worker route and link it to an
  office recovery case.
- Verification: recovery/field-work-pack API and ledger tests passed (8/8),
  including field-role denial and evidence-backed blocker closure; the office
  recovery browser flow passed with Axe checks and desktop/mobile overflow
  checks; the focused recovery UI tests passed (2/2); lint and release contract
  passed. The production assets measured 562,098 gzip bytes against the adjusted
  563,200-byte aggregate allowance; the separate recovery control measured
  2,787 of its 3,000-byte ceiling. Largest JS/CSS limits and other per-surface
  ceilings remain unchanged.

## 2026-09-24 - Coordinated worker replacement across affected jobs

- Extended an absence-linked recovery source with the complete company-local set
  of affected assignments and the existing role-, availability- and
  qualification-checked candidates. Duplicate conflict rows are consolidated by
  assignment; if the register reaches its 250-conflict limit, the UI blocks plan
  submission rather than assuming the visible list is complete.
- Office can choose a replacement for each affected job and submit one existing
  ledger replacement plan. It remains pending until an independent approver
  resolves it; original assignments, client dates and external communications
  remain untouched before approval. Pending plan identity remains visible after
  reload.
- Added domain and frontend coverage plus a desktop browser test that creates an
  absence affecting two jobs, selects both replacements, and verifies the
  approval-queue handoff. Focused recovery and availability tests passed (21/21),
  focused UI tests passed (3/3), both recovery browser tests passed, repository
  lint/build/release checks passed. Bundle limits were raised narrowly for this
  user-facing workflow: aggregate gzip ceiling 564,800 bytes, recovery component
  3,300 bytes, and the separately loaded replacement planner 1,600 bytes; measured
  output was 563,902 / 564,800, 3,166 / 3,300, and 1,450 / 1,600 bytes.
  Full Node run: 688 passed, 46 environment-dependent skipped, with one stale
  browser-discovery-count assertion; updating its expected count to 126 made its
  focused static-performance tests pass (3/3). Full frontend suite passed 83/83.

## 2026-09-24 - Evidence-referenced supplier follow-up in recovery

- Added a manual supplier-follow-up record to a current material-discrepancy
  recovery case when that receipt is linked to a purchase order. Contact result,
  notes and a source/evidence reference are retained with actor and time; a
  supplier-stated delivery date or next-contact date is required for the
  corresponding statuses. The command is retry-safe and rejects stale source or
  case versions. It does not send communication, alter the order date, place an
  order, or resolve the material shortfall.
- The office recovery screen now presents the associated supplier/order, prior
  follow-ups, and a guarded registration form. Added domain, operator UI, and
  browser workflow coverage; documented remaining customer-commitment and
  provider/contact boundaries. Added individual gzip budgets for the lazy
  recovery-actions and supplier-log modules.
- Verification: the full Node suite passed (691 passed, 46 environment-dependent
  skips); full frontend suite passed (84/84); all three operational-recovery
  browser flows passed; full lint and static-performance tests passed; production
  build and bundle verification passed (566,202 / 567,800 gzip bytes). PostgreSQL
  provider tests were skipped where the test database is not configured. No live
  supplier/customer communication, deployment, commit or push occurred.

## 2026-09-24 - Approved customer appointments enter absence recovery

- Joined approved site visits to workforce-disruption impact only when the
  appointment is assigned to the affected worker and falls within the retained
  absence window. Name-based matching is used only when the worker's name is
  unique; duplicate names require an ID match. The source hash includes the
  appointment set and approval identity so a changed appointment makes the
  recovery case stale. Unapproved and other-worker appointments are excluded.
- Office can retain a per-appointment decision (unaffected, customer follow-up
  required, or awaiting response) with a customer-conversation/assessment
  reference and next check date where needed. The operation is idempotent,
  approval/source version checked, and immutable appointment timing is left
  alone; no message is sent.
- Added domain, UI and browser coverage and clarified the glossary distinction
  between a confirmed client appointment and an internal schedule entry or
  whole-project completion promise. Broader contract/client-date promises and
  actual rescheduling remain outstanding.
- Verification: full Node suite passed (692 passed, 46 environment-dependent
  skips); frontend passed (85/85); all four operational-recovery browser flows
  passed, including mobile overflow and Axe accessibility checks. Full lint,
  release-contract and bundle checks passed; gzip total measured 568,204 / 570,800
  bytes. The configured PostgreSQL provider suite remains environment-skipped.
  No external communication, deployment, commit or push occurred.

## 2026-09-24 - Supplier delivery performance scorecard

Added a read-only supplier scorecard from issued purchase orders and accepted
material receipt history. It reports received/complete orders, on-time-and-
complete performance only for completed orders with a requested delivery date,
missing-date evidence, damaged quantities, open short deliveries, and issued
orders awaiting a first receipt. Draft and merely approved-but-unissued orders
are excluded. Suppliers are grouped by retained trade-partner identity where
available; otherwise the normalized supplier name is used. The endpoint is
office-only and performs no supplier contact or order action.

| Gate | Verified result |
| --- | --- |
| Domain and API | Supplier aggregation, split receipts, missing dates, damage, shortages, role access, and unauthenticated access tests passed. |
| Interface | Full frontend suite passed (116/116), including refresh, error, Dutch labels, and honest date-denominator rendering. |
| Regression | Full Node suite passed (741 passed, 46 environment-dependent skipped); ESLint, production build, and release contract passed (101 canonical paths, 12 retired paths, 17 hosted keys, 644 source files). |
| Bundle budget | Still fails: CSS 309,091/300,000 bytes; aggregate gzip 598,263/578,500; offline field 12,638/11,000; operational recovery 4,119/4,100. These limits were not relaxed. |
| Hosted parity | PostgreSQL integration remains unverified because `CONTRACTOR_AI_POSTGRES_TEST_URL` is not configured. The current host uses Node 25; `oidc-provider` reports Node 22 LTS as its supported runtime. |

## 2026-09-24 - Supplier history connected to tender review

- Added the source-derived supplier-history signal to each bid participant. It
  joins strictly by stable trade-partner ID and displays the measured rate and
  denominator alongside open shortages and damaged orders. Missing history or
  a failed read stays non-blocking and never creates a zero-score assumption.
- The signal is context for the human tender decision only. It does not rank or
  select bidders, change commercial evidence, or issue supplier communication.
- Verification: 4 focused component tests; full frontend suite 120/120; complete
  tender-to-approved-order browser flow 1/1; ESLint, production build, and
  release contract passed (646 source files). Bundle budgets remain over their
  existing CSS, total-gzip, offline-field, and recovery limits. The Node suite
  was not rerun after this UI-only connection; its latest full run passed 741
  tests with 46 environment-dependent skips.

## 2026-09-24 - Availability conflict completeness

- The availability register now detects overflow beyond its 250 visible
  conflicts using a 251st sentinel row. It returns an explicit completeness
  flag, distinguishes an exactly full complete list from a truncated list, and
  passes that flag into disruption recovery.
- The operator dashboard shows `250+` and disables only the cross-job batch
  replacement when the list is incomplete. Individual replacement still uses
  server-side availability, role, conflict, and qualification revalidation.
- Verification: 27 focused Node availability/recovery tests, all 139 frontend
  tests, and 4 operational-recovery browser tests passed. ESLint, production
  build, release-contract gate (101 canonical paths, 12 retired paths, 17 hosted
  keys, 654 source files), and `git diff --check` passed. No schema or provider
  action was involved. The separate bundle-budget gate remains over limit:
  largest CSS 310,535/300,000 bytes, total gzip 616,902/578,500 bytes, offline
  field 12,811/11,000 bytes, and operational recovery 4,651/4,100 bytes, with
  smaller recovery chunks also over their limits. No budget was increased.

## 2026-09-24 - Field offline cache follows its route dependency graph

- Replaced whole-product JS/CSS precaching with the production entry shell plus
  the `OfflineField` route's transitive static and dynamic dependencies, CSS,
  and referenced assets. Office, identity, and client-portal chunks are no
  longer downloaded into an executing worker's offline cache.
- The service-worker generator runs after Vite's CSS post-processing so it does
  not retain references to temporary empty JS stubs for CSS-only modules. A
  focused graph test and the production browser flow verify every emitted asset
  URL exists and that unrelated route chunks are absent.
- Verification: full Node suite passed (743 passed, 46 environment-dependent
  skipped, 0 failed); ESLint, production build, and release contract passed
  (647 source files). The mobile company-isolation/offline-sync browser flow
  passed (1/1). Field cache is 10 JS/CSS files (295,423 bytes) rather than all
  79 (2,391,447 bytes), avoiding about 2.10 MB / 87.6% of those raw assets.
  Existing bundle-budget failures remain unchanged; no limits were raised.

## 2026-09-24 - Route-sized UI and production bundle budgets

- Compacts only operator-locale keys used exclusively as literal translator
  arguments at build time. Dynamic status labels and persisted/runtime values
  remain unchanged. Added focused coverage for this transform.
- Extracted the job-workspace-only styles, offline download and safety-dossier
  views, recovery case detail, appointment review, and supplier form into
  separately loaded modules. Supplier forms load only after the operator opens
  them; their draft recovery and server-side approval checks are unchanged.
- Production verification: largest JS 530,376/600,000 bytes; largest CSS
  235,468/300,000; total gzip 561,246/578,500; offline field 6,189/11,000.
  Every measured work-context, recovery, supplier, and appointment chunk passed
  its existing budget; no threshold was raised.
- Verification: all 139 frontend tests; translation-compaction test; offline
  company-isolation browser flow 1/1; operational-recovery browser flows 4/4;
  full ESLint, production build, bundle budget, and release contract passed.
  The Node backend suite was not rerun in this UI/build-only pass. No commit,
  push, deployment, or provider action was made.

## 2026-09-24 - Client conversation update loop

- Added 20-second conversation polling only while the tab is visible and the
  device is online. The office is notified about new client messages and the
  client about newly published contractor replies; the UI does not auto-scroll.
- Poll refresh merges the latest page into already loaded history, deduplicates
  message IDs, preserves older pages and avoids rerendering unchanged timelines.
  Viewing the announcement scrolls to the newest received message and clears it.
- Made the optional local-AI capability display robust when the capability
  response has not arrived yet or is incomplete.
- Verification: focused conversation UI suite passed (5/5), full ESLint,
  production build, bundle-budget and release-contract gates passed. No Node
  route or persistence behavior changed. No push provider, WhatsApp, commit,
  deployment, or external action was involved.

## 2026-09-24 - Immediate customer conversation draft recovery

- Conversation drafts now read synchronously from the token-fingerprinted
  session scope on the first render, avoiding an empty-message window while the
  browser's persistence hook hydrates. Ongoing edits remain session-persisted;
  attachments are still deliberately not retained.
- The browser workflow now asserts the restored text before sending and
  continues through photo upload, office approval and publication.
- Verification: focused conversation component tests passed (5/5), the Chromium
  connected-experiences flow passed (1/1), all 140 frontend tests, lint,
  production build, bundle budget (530,402-byte
  largest JS; 562,344-byte total gzip) and release contract passed. No local
  customer ledger data was changed; no commit, push or deployment was made.
- The page-response probe observed successful (200) client and office photo
  reads; the test server also logged one 401 photo request not surfaced through
  that page-response observer. Its origin remains to be traced.

## 2026-09-24 - Supplier ETA into material forecast

- Added an explicit opt-in on evidence-backed supplier follow-up to apply a
  confirmed ETA to exactly one linked shortfall requirement. The server rejects
  ambiguous material scope, stale evidence, and orders without a recorded issue
  and external acceptance; it records the evidence reference and an audit event.
- Linked tasks consume the resulting ETA in a fresh schedule calculation. The
  purchase order's requested date and client dates remain unchanged; no message
  or resource-plan approval is created. The case source becomes stale and needs
  explicit reassessment.
- Verification: operational recovery domain/API tests 13/13, supplier recovery
  component tests 10/10, full frontend suite 140/140, supplier workflow in
  production Chromium 1/1, ESLint, build, bundle budget and release contract.
  Browser logs still contain an unrelated `403` for `/api/operations/capabilities`
  under the office-role session; assess whether that read-only capability route
  should be available to office operators. No commit, push, deployment or live
  provider action was made.

## 2026-09-25 - Supplier forecast refreshes the operator work plan

- Applying an evidence-backed supplier ETA now reloads the selected job and
  recalculates its visible task plan from the current planning start. This closes
  the gap where the material forecast updated in the ledger but the open work
  plan remained unscheduled until a manual calculation.
- The browser flow now covers the full path through an explicit schedule-baseline
  request and verifies it stays `pending_approval`; it also checks that the
  requested purchase date and communication ledger remain unchanged.
- Verification: production-bundle Chromium recovery suite passed (4/4), focused
  operational recovery tests passed (13/13), full frontend suite passed
  (140/140), ESLint passed without warnings, production build, bundle budget and
  release contract passed. The read-only `/api/operations/capabilities` route is
  now requested by the dashboard only for owners; the focused office-role
  browser flow confirmed it creates no forbidden request. No commit, push or
  deployment was made.

## 2026-09-25 - Opportunity demand against crew capacity

- Added a retained expected work window and per-trade hour forecast to the
  opportunity form and bid-decision capacity panel. The calculation reads
  current workforce profiles, dated allocations, overlapping assignments and
  standby periods; source changes invalidate pending decisions.
- A known capacity shortfall now remains a hard bid blocker even if a separate
  role or profile is unknown. Unknown-data gaps remain visible beside it. The
  assessment treats undated active assignments as unknown rather than free
  capacity, and does not reserve or assign workers.
- Fixed production-only operator-label compaction leaking internal tokens into
  English accessible names. The office translator keys stay readable; compact
  translations retain both language variants where needed.
- Documented the limitations: unregistered subcontractors, supervision,
  travel, dependencies, materials and detailed qualifications are not yet in
  this estimate.
- Verification: full Node suite passed (761 passed, 46 skipped), bid-decision
  API (1/1), translation compaction (1/1), frontend tests (140/140), lint,
  production build, release contract, and opportunity pipeline Chromium
  workflow (1/1) passed. PostgreSQL-dependent tests were skipped because no
  PostgreSQL test service was configured. The bundle budget gate remains
  blocked at 607,260 gzip bytes against its existing 578,500 byte ceiling.
  `git diff --check` reported no whitespace errors (only the checkout's normal
  LF/CRLF notices). No commit, push or deployment was made.

## 2026-09-25 - Work board positions remain tied to current task scope

- Published positions now retain a checksum of their linked tasks, covering
  trade requirements, descriptions, lifecycle status, schedule and duration.
  A later task change makes the position stale and prevents enrollment or
  placement until the contractor closes it and reissues reviewed terms.
- Publication rejects completed/cancelled source tasks and a declared task
  trade that conflicts with the advertised position. Legacy task-linked
  positions without a source checksum fail closed for new enrollment.
- Verification: work-board domain tests 14/14, API tests 2/2, relevant worker
  and office component tests 13/13, ESLint and production build passed.
  PostgreSQL and deployment behavior were not tested in this increment. No
  commit, push or deployment was made.

## 2026-09-25 - Save task-derived position concepts before release

- The office can save incomplete task-linked positions into the existing ledger,
  resume them after reload, and publish the same retained position only after
  all required terms and the explicit public-content confirmation are provided.
  Missing hourly rates and worker capacity remain blank rather than guessed.
- Drafts are excluded from worker listings. Task or package source changes block
  publishing until the draft is deliberately re-saved against current sources;
  publication reuses its idempotency key and records the normal audit event.
- Verification: work-board domain tests 15/15, API tests 2/2 (including owner
  authorization, hidden drafts and publication), related worker/office UI tests
  15/15, production-bundle browser workflow 2/2, ESLint, production build and
  release-contract check passed. PostgreSQL and production hosting were not
  exercised. No commit, push or deployment.

## 2026-09-25 - Show worker absence even without a standby replacement

- The job work-board now retains and displays every scheduled assignment
  affected by an admitted worker's reported unavailability, including when no
  standby candidate qualifies. It shows the operational window and workflow
  state only; it does not display a reason or medical detail.
- Added a working action that opens the planning tab and scrolls to the job's
  operational recovery section and selects the exact current absence record.
  Changed or inactive sources fail visibly and require refresh. No recovery
  case, assignment, schedule or customer commitment is created or changed
  automatically.
- Verification: combined work-board domain/API tests 18/18, office, dossier and
  recovery-source UI tests 21/21, production-bundle Chromium work-board flows
  2/2, ESLint and production build passed. Hosted PostgreSQL and deployment
  were not exercised. No commit, push or deployment.

## 2026-09-25 - Report unavailability from the native field app

- Authenticated Android field users can submit an unavailability window without
  entering a reason or medical information. The API derives the worker identity
  from the session and returns assigned-shift conflicts; the app makes clear
  that reporting does not alter assignments. This path requires connectivity
  and is not queued offline.
- Date controls keep unknown-return review dates after the selected start and
  reject invalid end times before submission. Added API coverage for a real
  overlapping assignment and native source-contract assertions.
- Verification: focused offline-work-pack and identity API suites passed (10
  tests). Android compilation/device verification was unavailable because Java,
  Gradle, Android SDK and adb are absent. No commit, push or deployment.

## 2026-09-25 - Queue native unavailability reports offline

- The Android worker can now keep an unavailability report in the encrypted
  account-scoped queue while offline. Sync rechecks the original worker/server,
  calls the identity-derived API, and returns assignment conflicts without
  changing assignments. Server-confirmed results remain encrypted until reviewed,
  including after an interrupted sync. Health details are neither requested nor
  retained. Waiting reports are capped at 10 and retained conflict details at 50.
- Verification: native offline source-contract and identity API suites passed
  (11 tests), including conflicting assignments and exact API replay; repository
  ESLint passed. Android compilation/device verification remains unavailable
  without Java, Gradle, Android SDK and adb. No commit, push or deployment.

## 2026-09-25 - Encrypted offline customer conversation outbox

The client portal now prepares its public offline shell and retains encrypted,
device-local project and recent conversation snapshots after an online visit.
During a network outage, customers can queue text and one permitted photo,
reload, and later synchronize the exact content with the same idempotency key.
The UI marks queued content as local and not received until the API confirms it.
Photo reads remain token-scoped; online authorization failures clear cached
portal/chat snapshots.

The outbox is capped at 10 entries and 20 MiB, with 5 MiB per photo and seven-day
retention. AES-GCM keys are derived in memory from the client token; the raw token
is not persisted. Snapshots may be stale. Offer responses, contracts, feedback
and selections are not enabled offline; disconnected devices cannot learn about
revocation or erase already retained local data.

| Gate | Verified result |
| --- | --- |
| Frontend | Full frontend regression passed (153/153); focused encrypted outbox and conversation coverage passed (17/17). Repository-wide ESLint passed. |
| Browser | Production-bundle mobile Chromium verified service-worker readiness, offline text/photo queue, page reload, stale snapshot notice, reconnect, authenticated photo retrieval and exact server receipt (1/1). |
| API/release | Conversation, client portal and offline-shell API suites passed (8/8); release contract is valid (101 canonical routes, 12 retired routes, 17 hosted environment keys). `git diff --check` passed. |
| Security boundary | No unencrypted token/photo bytes are stored; no offline portal decision is submitted. No live WhatsApp, AI provider, hosted database or native-app behavior is claimed. |

## 2026-09-25 - Prune unreachable operator translations

The production catalog compactor now removes Dutch entries that have no
reference anywhere in runtime source, while retaining dynamically selected
labels and compacting only literal translator calls. This removes 86 unreachable
entries from the current catalog without changing the public translator API.

| Gate | Verified result |
| --- | --- |
| Catalog | Compactor regression tests passed (2/2), including runtime preservation of dynamic labels and removal of unreachable entries. |
| Product behavior | Full frontend suite passed (153/153); Dutch/English production Chromium round-trip passed (1/1); repository ESLint and release contract passed. |
| Bundle | Total gzip decreased from 613,966 to 612,861 bytes but still exceeds the 578,500-byte cap. Client-delivery assets remain 8,552/8,500 bytes. No budget was raised; this optimization does not clear the bundle gate. |

## 2026-09-25 - Route new client messages into the contractor inbox

Active client-conversation messages now appear in a contractor-only inbox on
the daily dashboard. Each entry links directly to its job and client access.
The office can explicitly mark up to 50 currently loaded inbound messages as
reviewed; opening a conversation alone does not clear the inbox. Message bodies
and photos remain out of the inbox summary, and review is retained as a separate
audit event tied to the immutable message source hash. Field-worker access to
the inbox is denied, and the dashboard endpoint now uses the operator role
projection instead of returning the raw ledger dashboard to every role.

| Gate | Verified result |
| --- | --- |
| API | Conversation unit and integration tests passed (5/5), including office-role authorization, body-free inbox summaries, explicit/idempotent review, reviewed timestamps, and new-message reopening. |
| Browser | Production-bundle mobile/desktop connected-experience flows passed (2/2), including dashboard inbox to exact conversation navigation and review. |
| Quality | Repository ESLint and Vite production build passed. No commit, push or deployment. |

## 2026-09-25 - Opt-in local analysis for opened client conversations

Added `CONTRACTOR_AI_CHAT_AI_AUTO_ANALYZE`, a separate opt-in that defaults
false independently of local model availability. When enabled, opening an
office conversation with unreviewed inbound client messages automatically runs
the existing current-source-checked local analysis; newly received messages are
also analyzed while the conversation remains open. Analysis still creates only
an internal source-linked proposal. It cannot create an RFI, alter a task,
approve or publish a reply, or send externally. The local model verification
script explicitly forces auto-analysis off.

| Gate | Verified result |
| --- | --- |
| Domain/API | Analysis configuration and conversation API tests passed (10/10), including default-off, independent opt-in, capability reporting, source checks and existing message safety. |
| Interface | Conversation UI tests passed (8/8); the full frontend suite passed (155/155). Enabled auto-analysis issues exactly one internal analysis request, while opt-in off leaves manual analysis available. |
| Remaining limit | This runs when an office conversation is opened or refreshed in an active browser, not as a durable background server job. Live Ollama quality and processing against real customer data were not tested. No commit, push or deployment. |

## 2026-09-25 - Prevent conflicting standby call-out acceptance

Worker acceptance now rechecks the exact assignment snapshot, active standby
window, original worker's overlapping unavailability, and the candidate's current
role, availability, and qualification readiness. A worker with an accepted or
approval-pending call-out cannot accept another call-out whose assignment window
overlaps it. The check and status transition share the ledger transaction, so
simultaneous accepts cannot both reserve the same worker. Declining an outstanding
offer remains available without relying on current assignment or qualification
state. Placement still requires the existing separate independent approval.

| Gate | Verified result |
| --- | --- |
| API/work-board | Focused standby-callout and work-board suites passed (17/17), including overlapping call-outs, rejection of the second acceptance, successful decline, worker ownership, and independent replacement approval. |
| Remaining limit | Updates are visible through authenticated work-board polling while the worker page is open; this does not provide background push or external notifications. PostgreSQL provider parity and live mobile-device behavior were not exercised. No commit, push or deployment. |

## 2026-09-25 - Compare supplier ETA with affected task starts

Material recovery impact now includes a per-task comparison between an
evidence-referenced expected-availability date and the affected task's start in
the current approved schedule baseline. It distinguishes expected availability
before/after task start, no recorded date, unscheduled tasks, and stale/missing
baselines. The comparison is a source-bound operational signal only: it does
not reschedule work, change a purchase order or modify a customer commitment.

| Gate | Verified result |
| --- | --- |
| Backend | Operational recovery unit, API and daily-command suites passed (19/19), including before/after task starts, evidence retention, unknown ETA and stale baseline handling. |
| Interface | Operational recovery React suite passed (12/12), including the button's source-dossier navigation intent; repository-wide ESLint passed. |
| Browser | Production-bundle operational recovery workflows passed (4/4), including supplier ETA to the live resource-preview panel without applying a plan. |
| Regression | Full Node suite passed (769/769, 46 skipped); production Vite build and release contract passed (101 canonical paths, 12 retired paths, 17 hosted environment keys). |
| Remaining limit | Date comparison uses calendar days, not task-shift hours, travel, delivery windows or working calendars. Bundle verification remains red: total 614,837/578,500 gzip bytes, client delivery 8,551/8,500, replacement plan 1,615/1,600 and recovery actions 917/900; the recovery-case and recovery-control chunks are within their individual limits. PostgreSQL runtime parity and live supplier/provider behavior were not exercised. No commit, push or deployment. |

## 2026-09-25 - Compact Dutch-only accessibility fallbacks

Production compaction now stores Dutch-only labels used exclusively by the
operator `ot(...)` wrapper without duplicating their English fallback in the
translation catalog. The English fallback stays at each callsite, including
parameterized and nested labels. Keys shared with other translator paths or
runtime/dynamic lookups retain their prior catalog representation.

| Gate | Verified result |
| --- | --- |
| Compactor | Focused Node compaction tests passed (2/2); lint passed; all frontend tests passed (156/156). |
| Browser | Production-bundle operator locale round-trip passed (1/1), including the job-workspace accessible label in Dutch and retained English behavior. |
| Build | Production Vite build passed. Dutch translation chunk fell from 92,550 to 84,760 gzip bytes; total bundle fell from 614,837 to 609,148 gzip bytes. |
| Remaining limit | Bundle verification still fails at 609,148/578,500 total, client delivery 8,551/8,500, replacement plan 1,613/1,600, and recovery actions 912/900 gzip bytes. No budget was raised. PostgreSQL runtime parity and live provider behavior were not exercised. No commit, push or deployment. |

## 2026-09-25 - Reproducible native Android build entry point

Added the official Gradle 8.11.1 wrapper files, pinned the binary distribution
SHA-256 and made the Android build script use the wrapper by default. The wrapper
JAR checksum matches Gradle's published 8.11.1 value. Build instructions no
longer require a separately installed Gradle executable; JDK 17+ and Android
platform/build tools 35 are still required. The build script does not accept
Android SDK licenses, install SDK packages or make provider/deployment changes.

| Gate | Verified result |
| --- | --- |
| Wrapper integrity | Official wrapper JAR SHA-256 matched `2db75c40782f5e8ba1fc278a5574bab070adccb2d21ca5a6e5ed840888448046`; official Gradle 8.11.1 distribution SHA-256 `f397b287023acdba1e9f6fc5ea72d22dd63669d59ed4a289a29b1a76eee151c6` is pinned in wrapper properties. |
| Source | Native build/release contract tests passed (11/11); PowerShell script parsed cleanly; whitespace check found no errors. |
| Remaining limit | This checkout has no Java, Android SDK or adb, so the wrapper could not execute and no APK or device acceptance is claimed. The wrapper downloads Gradle on first use; Android SDK terms and installation remain an operator step. No commit, push or deployment. |

## 2026-09-25 - Offline safety briefing acknowledgement in native field packs

Native Android field packs now include the worker-scoped safety briefings for
their assigned job. A worker can record an explicit acknowledgement offline
with an evidence reference; it remains encrypted and pending in the local
outbox until synchronization is confirmed. The server binds the acknowledgement
to a SHA-256 hash of the briefing content and rejects stale offline copies with
409 if the briefing topics or other briefing content changed. The web client
uses the same revision-bound API contract. Acknowledgement is not safety
clearance or permission to begin work.

| Gate | Verified result |
| --- | --- |
| Regression | Full Node suite passed (771/771, 46 skipped); focused safety/API and release-contract suites passed (48/48). Frontend tests passed (156/156); lint passed. |
| Browser | Production Chromium safety-briefing workflow passed (1/1), including source-bound acknowledgement. |
| Release | Release contract passed (101 canonical paths, 12 retired paths, 17 hosted environment keys, 667 source files). `git diff --check` reported no whitespace errors. |
| Remaining limit | Bundle budget remains red at 609,203/578,500 gzip bytes; client delivery 8,551/8,500, replacement plan 1,615/1,600 and recovery actions 916/900. Android source-contract checks passed, but no Android SDK/JDK/Gradle/device was available for compilation or device acceptance. PostgreSQL runtime parity and live providers were not exercised. No commit, push or deployment. |

## 2026-09-25 - Field and Operator Reliability Follow-up

The production Dutch equipment workflow exposed that dynamic `checked out`
statuses were not translated, although the underscore-form status was. The
central formatter now maps both forms to the same Dutch label. The production
locale compactor also stores Dutch-only catalog values and carries English
fallbacks with their calling UI, reducing the Dutch catalog chunk while
preserving an English round trip. This first-load optimization trades a small
increase in the aggregate sum of all independently compressed lazy assets; no
existing budgets were raised.

| Gate | Verified result |
| --- | --- |
| Localization | Frontend locale tests passed; production equipment custody flow passed in Dutch and after switching back to English. |
| Regression | Full frontend suite passed (175/175), focused locale/release/native-source Node tests passed (22/22), and repository lint passed. |
| Bundle | Build passed; operator locale chunk is 52,037 gzip bytes versus 77,962 before this compaction (down 25,925). Aggregate gzip is 615,872/578,500 and Brotli is 532,429/540,000. The pre-existing three feature gzip budgets also remain over by 49, 16 and 15 bytes. |
| Native release boundary | Android source-contract tests passed; APK compilation and emulator/device acceptance remain unverified because JDK 17, Android SDK platform 35 and adb are absent. The project build script does not accept SDK licenses automatically. |
| External boundary | No commit, push, deployment, provider execution or live-device action was performed. |

## 2026-09-25 - Searchable Job Register

The jobs register can now search persisted work by title, client, location or
job ID through the existing ledger API. It keeps the default recent-jobs view,
supports returning to that view with one action, and communicates loading,
empty, failure and bounded-result states. Search requests continue through the
company-aware API client and the server's field-worker scoping; the interface
states that search covers at most the 500 most recently updated candidates so
an empty result is not mistaken for proof that no older record exists.

| Gate | Verified result |
| --- | --- |
| Frontend | Full frontend suite passed (178/178); focused register-search suite passed (3/3). |
| Browser | Production Chromium workflow passed (1/1): it created 100 newer jobs, confirmed the target was absent from the default 100, found it by search, and verified Dutch labels and the result boundary. |
| Build and lint | Production Vite build and repository lint passed. |
| Bundle | Existing gate remains red and no budgets were raised: gzip 617,007/578,500; client delivery 8,553/8,500; replacement plan 1,618/1,600; recovery actions 916/900. Brotli is within budget at 533,206/540,000. |
| Remaining limit | Search deliberately reports its 500-candidate cap and does not claim exhaustive historical pagination. No commit, push or deployment. |

## 2026-09-25 - Complete Job Register Cursor Pagination

Follow-up correction to the search entry above: the 500-candidate ceiling has
been removed. The jobs API now returns deterministic keyset pages of up to 100
records, with a continuation cursor ordered by update time and job ID. Search
and the recent-jobs list both support previous/next navigation, and worker
assignment scope is applied in SQL before page boundaries. The interface no
longer implies that an older job is absent just because it was not in the first
page.

| Gate | Verified result |
| --- | --- |
| Ledger and access scope | Full Node suite passed (793 passed, 47 skipped, 0 failed). Pagination tests traversed 506 records with no gaps or duplicates, verified stable tie ordering and worker-scope filtering, and rejected incomplete cursors. |
| Frontend and browser | Full frontend suite passed (178/178); production Chromium search-and-pagination flow passed (1/1), finding a matching job beyond the first 100 records. |
| Lint and build | Repository lint passed; production build passed as part of the browser run. PostgreSQL runtime tests were skipped because no PostgreSQL test connection is configured. |
| Bundle | Existing gate remains red and limits were not raised: gzip total 617,310/578,500; client delivery 8,553/8,500; replacement plan 1,618/1,600; recovery actions 916/900. Brotli 533,573/540,000 passes. |
| External boundary | No commit, push, deployment or provider action was performed. |

## 2026-09-25 - Local Conversation AI Refusal Safeguard and Model Evaluation

The local Ollama path was exercised against a synthetic customer message with
an explicit refusal of a EUR 1,200 price increase and a separate measurement
question. The installed `qwen3:4b` initially proposed asking the customer to
accept the refused amount. That output was not enabled or retained. The prompt
now includes a refusal-specific example, and deterministic validation rejects
and permanently dead-letters a proposed finding if it omits explicit
non-approval or invites acceptance. Source quotes and model output remain
review-only; no business action is executed.

| Gate | Verified result |
| --- | --- |
| Failure case | The durable queue integration test proves contradictory output is not saved and reaches a permanent `dead_letter` with `explicit_non_approval_conflict`. |
| Local model | Synthetic evaluation passed against Ollama 0.33.3 / `qwen3:4b`: source-grounded findings, refusal preserved, measurement question retained separately, 0 external commitments. Direct inference took 46,108 ms; the durable temporary-ledger flow then completed in 54,885 ms with queue status `completed`. A preceding failed evaluation caught the unsafe reversal. |
| Regression and lint | Conversation analysis tests passed (11/11); repository lint passed. |
| Activation boundary | The test temporarily opted into the durable worker in its child process and restored the prior environment. The Ollama loopback service was started; Contractor.AI persisted/runtime configuration was not changed, and this test did not enable automatic analysis in the app. No real customer messages or photographs were submitted. |
| Remaining limit | The guard covers explicit refusal/approval vocabulary in Dutch and English; it is not a general guarantee of model reasoning or legal interpretation. No commit, push or deployment. |

## 2026-09-25 - Manual Local Model Readiness and Safe Launch

Added an authenticated office action that checks the loopback Ollama version and
installed-model list without sending conversation content or photos. Responses
are bounded, failures use stable generic errors, and role scope is rechecked
after the asynchronous status calls. The UI reports whether the selected model
is installed and whether automatic analysis remains off. Added
`npm run dev:api:local-ai` as a deliberate local-only launch mode: text analysis
is enabled for the selected local model, while automatic analysis and vision stay
disabled. Hosted mode and cloud-labelled models are rejected.

| Gate | Verified result |
| --- | --- |
| Backend | Local status helper, model absence, network failure and launcher configuration tests passed; conversation analysis and authenticated API suites passed (15/15). Status JSON parsing is bounded in code. |
| Interface | Conversation component suite passed (11/11), including explicit status-check action and proof that no customer content or analysis request is sent. |
| Live local runtime | The new status helper queried loopback Ollama 0.33.3 and confirmed installed `qwen3:4b`; it sent no customer data and reported automatic analysis off. |
| Quality | Repository lint, Vite production build and release contract passed (101 canonical paths, 12 retired paths, 17 hosted environment keys, 687 source files). Bundle gate remains red at gzip 617,562/578,500; client delivery 8,556/8,500; replacement plan 1,616/1,600; recovery actions 913/900. Brotli is 533,756 bytes. No budgets were raised. |
| Runtime boundary | Existing local Vite/API processes were not restarted or modified. The active API does not pick up the new opt-in until deliberately restarted with the new command; no live model-status click in that app instance is claimed. No customer messages/photos submitted, no commit, push or deployment. |

## 2026-09-25 - English Office Conversation Operations

Completed the English operator-language path for source-linked conversation
analysis, local-model readiness, internal RFI and variation preparation, and
WhatsApp administration. Known backend capability/channel statuses are
localized for Dutch operators; unrecognized diagnostic reasons remain intact.
Model-generated findings are still Dutch, and the English interface now states
that limitation rather than implying generated text is translated.

| Gate | Verified result |
| --- | --- |
| Conversation UI | Full frontend suite passed (180/180 across 40 files), including an English variation-review path, disabled WhatsApp state and assertion that no external POST was made. |
| Quality | Repository lint, production build and release contract passed (101 canonical paths, 12 retired paths, 17 hosted environment keys, 687 source files). |
| Bundle | Existing budget gate remains red and budgets were not raised: gzip 618,778/578,500; client delivery 8,554/8,500; replacement plan 1,619/1,600; recovery actions 916/900. Brotli is 534,717/540,000. |
| Runtime boundary | The active API was left untouched because its Windows process cannot be gracefully signalled through the available process handle. No customer data, provider action, commit, push or deployment. |

## 2026-09-25 - Dutch-First Browser Language Selection

When an operator has not selected a dashboard language, Contractor.AI now uses
the first supported browser language: Dutch variants select Dutch and English
variants select English. Other browser languages fall back to English. A saved
operator preference and a current manual override remain authoritative; browser
language is not persisted as a replacement preference.

| Gate | Verified result |
| --- | --- |
| Locale behavior | Locale unit suite passed (5/5), covering `nl-BE`, `en-IE`, unsupported-language fallback, and saved-choice precedence. |
| Preference contract | Session-auth and company-runtime API suites passed (5/5): an unpersisted `en-GB` system default is distinguishable from a saved locale; a saved Dutch preference is marked persisted. The client also recognizes the prior API shape by its non-null `updatedAt` field. |
| Frontend | Full frontend suite passed (181/181 across 40 files) with two workers. A preceding unrestricted parallel run had three 5-second test timeouts; all three affected suites passed individually and the bounded full rerun passed. |
| Quality | Repository lint, Vite production build and release contract passed (101 canonical paths, 12 retired paths, 17 hosted environment keys, 687 source files). |
| Bundle | Final built gate still fails without budget changes: gzip 618,893/578,500; client delivery 8,554/8,500; replacement plan 1,616/1,600; recovery actions 915/900; Brotli 534,787/540,000. Repeated builds varied by tens of compressed bytes. A module-minification experiment saved only 1,724 gzip bytes across JavaScript, so the build minifier was not changed. |
| Runtime boundary | Existing preview processes were not restarted. Interactive browser inspection was unavailable because this session's browser-control provider had no Codex auth token. No external provider, commit, push or deployment. |

## 2026-09-25 - Company-Wide Disruption Recovery Queue

Added an owner/office-only portfolio view that consolidates active recovery
cases across jobs without introducing another case register. The read-only
projection checks retained case integrity, compares current source evidence,
shows overdue/missing follow-up and cross-job conflicts, and links back into
the existing job recovery dossier. Corrupt snapshots are redacted in this
view. Source records remain editable only in their existing job workflow.

| Gate | Verified result |
| --- | --- |
| Recovery API | Operational recovery, command-plan and API suites passed (22/22); the portfolio test covers owner/office access, field-worker denial, current-source status, and redaction of a corrupted case. |
| Dashboard | Full frontend suite passed (183/183 across 41 files), including Dutch and English filters, stale-source attention, cross-job context, and job navigation. |
| Quality | Repository lint and production build passed. Release contract passed (101 canonical paths, 12 retired paths, 17 hosted environment keys, 690 source files). |
| Bundle | Existing budget gate remains red without budget changes: gzip 622,118/578,500, client delivery 8,551/8,500, replacement plan 1,615/1,600, recovery actions 916/900, Brotli 537,577/540,000. |
| Runtime boundary | The already-running preview was not restarted and interactive browser verification was not available. No provider action, commit, push or deployment. |

### Follow-on - Unassigned Active Disruptions

Extended the same portfolio projection to discover live source records that
are not linked to an open recovery case. The source scan is limited to 200
candidate jobs, reuses company-wide availability and supplier-risk data, and
reports incomplete coverage when case/job limits, source errors, or the
availability register bounds prevent a complete check. Opening an unassigned
item navigates to its job recovery control and selects the source; it does not
create a case or perform a consequential action.

| Gate | Verified result |
| --- | --- |
| Recovery API | Recovery, command-plan and API suites passed (22/22), including an active but unowned material shortfall and the owner/office versus field-worker authorization boundary. |
| Dashboard | Recovery portfolio and job-control suites passed (16/16), including selecting a material source through dossier navigation. |
| Quality | Full repository lint and production build passed. |
| Bundle | The existing gate remains red: gzip 622,283/578,500; client delivery 8,551/8,500; replacement plan 1,614/1,600; recovery actions 914/900; Brotli 537,953/540,000. Budgets were not raised. |
| Live preview | Read-only request to the already-running API on port 3001 returned 404 for the new route, confirming its process still needs a controlled restart before the UI can use this endpoint. |

### Follow-on - Privacy-Safe Operational Impact

Added compact, structured impact summaries to the company-wide disruption
queue: material shortfalls and needed dates, affected/critical task counts,
cross-job schedule conflicts, client appointment counts, milestone review,
safety review severity, field progress, and equipment readiness. The
projection omits incident titles, absence reasons, free-form notes, and free
recovery-action text; detailed case handling stays in the job dossier.

| Gate | Verified result |
| --- | --- |
| Recovery backend | Recovery API, case, command-plan and portfolio-summary tests passed (25/25), including checks that structured impact survives while personal and free-text details are excluded. |
| Dashboard | Portfolio and job-control suites passed (16/16), including localized material shortage quantity/date display. |
| Quality | Repository lint and production build passed. Release contract passed (101 canonical paths, 12 retired paths, 17 hosted environment keys, 691 source files). |
| Bundle | Existing budget gate remains red: gzip 623,234/578,500; client delivery 8,551/8,500; replacement plan 1,615/1,600; recovery actions 913/900; Brotli 538,664. Budgets were not raised. |
| Runtime boundary | No live preview restart, provider action, commit, push or deployment. |

### Follow-on - Impact-Aware Recovery Triage

The recovery portfolio now treats unresolved operational impact as requiring
attention even when a case has a future follow-up date. High/critical safety
reviews rank first, followed by other safety, material/equipment/field blockers,
and cross-job/client/critical-path conflicts; source currency and overdue/missing
follow-up remain attention triggers. This changes visibility and ordering only,
not assignment, approval, or execution state.

| Gate | Verified result |
| --- | --- |
| Dashboard | Portfolio and recovery-control tests passed (16/16), including a future-dated high-severity safety case appearing in “Aandacht” and sorting above a lower-impact stale case. |
| Quality | Repository lint and production build passed. |
| Bundle | Existing gate remains red: gzip 623,432/578,500; client delivery 8,551/8,500; replacement plan 1,618/1,600; recovery actions 914/900; Brotli 538,837. No budgets were raised. |
| Runtime boundary | No live preview restart, provider action, commit, push or deployment. |

## 2026-09-25 - Full Local Regression Pass

Ran the full Node and React regression suites against the current worktree after
the company-wide recovery summary and impact-aware triage changes. This is a
local regression result, not a production or PostgreSQL acceptance claim.

| Gate | Verified result |
| --- | --- |
| Node | 848 tests discovered: 801 passed, 47 PostgreSQL-dependent tests skipped, 0 failed. No PostgreSQL test connection was configured. |
| Frontend | 41 files and 184 tests passed using two workers. |
| Runtime caveat | The host default is Node 25.2.1; `package.json` declares Node 22.x. The run emitted the identity provider's unsupported-runtime warning, so the passing tests do not establish compatibility on the declared production runtime. A bundled Node 24.19.0 executable is available, but the application still declares Node 22.x and this run did not switch runtimes. |
| Release caveat | The previous production build passed; the aggregate gzip budget remains failed and no limit was raised. This pass did not restart the live preview or deploy anything. |

## 2026-09-25 - Quality NCRs in Company Recovery Queue

Open governed nonconformance records now appear as company-wide recovery sources,
including when no recovery case has yet been assigned. The portfolio exposes only
the generic quality label, controlled severity, due date, and integrity/action
flags; NCR descriptions, locations, parties, notes, and evidence remain in the
quality dossier. Recovery cases cannot close an NCR or bypass its independent
corrective-action and closure approvals. Resolved NCRs remain source-verifiable
for existing recovery cases without appearing as new active disruptions.

| Gate | Verified result |
| --- | --- |
| Node | NCR lifecycle, recovery, portfolio-summary, and API/command-plan tests passed (33/33). |
| Frontend | Operational recovery portfolio tests passed (3/3), including localized quality due-date and closure state. |
| Quality | Focused ESLint passed; Vite production build passed. |
| Runtime boundary | No live preview restart, provider action, commit, push or deployment. The existing aggregate bundle-budget issue recorded above remains unresolved. |

## 2026-09-25 - Trade-Safe Work Position Drafting

Office users can prepare private, idempotent position drafts directly from
uncovered executable task suggestions. Drafts retain the task's role, location,
timing, duration and linked materials without inventing a rate or capacity;
publication and worker placement remain separate deliberate actions. The
editor excludes job-intake coordination checklist items from worker openings
and prevents one position from combining incompatible trades. Legacy checklist
records are recognized conservatively, while a real executable task is still
eligible even if it has a familiar title.

| Gate | Verified result |
| --- | --- |
| Domain/API | Work-board and API tests passed (22/22), including legacy intake-task filtering and same-title executable task coverage. |
| Frontend | Full suite passed: 41 files, 187 tests. Focused UI tests cover role-compatible task selection and repeat-safe draft preparation. |
| Browser | Built-app Chromium completed the position drafting, publication and worker admission/self-enrollment flow (1/1). |
| Full regression | Node suite: 851 discovered, 804 passed, 47 skipped, 0 failed. PostgreSQL-dependent tests were skipped because no test connection was configured. |
| Quality and boundary | Focused ESLint passed. No commit, push, deployment, public position release or external provider action. Existing bundle-budget limits remain unresolved. |

## 2026-09-25 - Enforce Work-Position Source Rules in the Domain Layer

Closed an API-level path around the intake-checklist exclusion: position draft
creation and public release now both reject internal intake/coordination tasks
as worker-position sources. The rule is enforced with the task's retained job
context, so direct API callers cannot bypass the user-interface suggestion
filter. Ordinary executable tasks and the conservative legacy-signature logic
remain unchanged.

| Gate | Verified result |
| --- | --- |
| Work-board backend/API | 22/22 focused tests passed, including direct draft and publication attempts against default intake tasks. |
| Quality | ESLint passed for the changed backend and tests; Vite production build passed. |
| Delivery boundary | No commit, push, deployment, or public position release. |

## 2026-09-25 - Work-Board Privacy Requests

Integrated admitted work-board workers with the existing data-subject request
flow. Inventory now signals linked account and application records without
exposing credentials; exports include the account profile, applications,
worker-visible position terms, offer history, and session metadata while
excluding password material, session token hashes, and internal position
details. Erasure is blocked while an application is still open. After the
existing approved worker-retirement gate, linked board authentication is
pseudonymized and active sessions are revoked; recruitment records and
tamper-evident history remain retained.

Pending self-registered applicants without a linked worker record remain
outside this request flow. Company identity and membership records also need
their own linked-data review before broad privacy coverage can be claimed.

| Gate | Verified result |
| --- | --- |
| Privacy and work-board tests | 28/28 passed, including export privacy boundaries, open-application erasure block, session revocation, and rejected login after pseudonymization. |
| Full Node regression | 852 discovered, 805 passed, 47 skipped, 0 failed. PostgreSQL-dependent tests were skipped without a configured test connection. |
| Quality | ESLint passed for the changed backend and tests; `git diff --check` passed; Vite production build passed. |
| Delivery boundary | No commit, push, deployment, or provider action. |

## 2026-09-25 - Applicant Privacy Self-Service and Admission Continuity

Followed through on the pending-applicant privacy gap above. Authenticated
applicants can submit and track their own privacy requests from the work board;
request identity is derived from the session, not caller-supplied fields.
Registration identity is retained when admission creates the worker record,
so approved restrictions, source-current requests and profile corrections stay
attached to the same person. Restrictions block admission/enrollment until an
approved lift. Admission also waits for a pending privacy approval, preventing
the account transition from silently staling that approval. Pending-applicant
pseudonymization clears login material and revokes sessions without requiring
a nonexistent worker-retirement record. Exports remain operator-reviewed and
are not automatically delivered through the worker portal.

| Gate | Verified result |
| --- | --- |
| Node vertical slice | Privacy, work-board API and domain tests passed (31/31), including pending-applicant export/correction/pseudonymization, stable identity through admission, restriction enforcement, and pending-approval continuity. |
| Frontend | Full Vitest suite passed: 42 files, 188 tests. The work-board privacy panel is lazy-loaded, self-scoped and status-aware. |
| Quality | Full ESLint and Vite production build passed; `git diff --check` passed. |
| Regression context | The most recent complete Node suite before this increment passed 805 tests, skipped 47 PostgreSQL-dependent cases, and had 0 failures. The final increment received focused Node coverage (31/31); the complete Node suite was not rerun after these last changes. |
| Remaining boundary | Identity registry and membership records need a separately scoped integration. This is not a legal conclusion or retention schedule. No commit, push or deployment. |

## 2026-09-25 - Explainable Recovery Triage

Unassigned disruptions in the company-wide recovery queue now receive a
deterministic priority and a first-review action derived from current structured
evidence: safety, critical path, workforce conflicts, client appointments,
contract dates, materials, field blockers and equipment. A conflict is labelled
for review today only when its source carries an affected date within 48 hours;
unknown or more distant events remain planable follow-up, not invented deadlines.
Existing cases receive the same triage. The interface labels these as review
guidance; it does not set deadlines, alter assignments or commitments, contact
anyone, or bypass approval.

## 2026-09-25 - Site Receipt Inspection Visibility

Warehouse-to-site receipts now calculate an explicit per-receipt and per-issue
quantity awaiting inspection. Only accepted quantities remain available to the
job. The field work pack reports the hold and its evidence references; entering a
partial receipt now defaults accepted quantity to the amount actually received,
and the form previews and prevents an impossible accepted-plus-damaged total.
Operational recovery retains inspection and damage quantities, keeps a material
review source visible even after the shortfall is otherwise covered, and shows a
review-before-use action and the affected quantities in both queue and case views.

| Gate | Verified result |
| --- | --- |
| Backend and API | Shared stock and operational recovery suites passed (25/25), including accepted-only availability, explicit inspection quantities, API return data and role checks. |
| Frontend | Full Vitest suite passed: 43 files, 190 tests. Focused field work pack and locale checks passed (22/22), including partial arrival defaults and quantity validation. |
| Quality | Focused ESLint, Vite production build and `git diff --check` passed. |
| Scope | Inspection figures are derived from retained receipt quantities; this increment does not alter historical receipt rows or reclassify stock automatically. |
| Release budget | `verify:bundle` still fails: gzip 628527/578500 bytes and Brotli 543508/540000; also client delivery 8551/8500, recovery case 3023/3000, replacement plan 1616/1600 and recovery actions 1023/900. Limits were not raised. |
| Delivery boundary | No commit, push or deployment. |

## 2026-09-25 - Site Receipt Inspection Decision Loop

Completed the office-side classification path for site deliveries. An owner or
office operator can review the still-pending quantity on each receipt and
classify any amount as accepted or damaged, with a reason and evidence
reference. Decisions are append-only, retry-safe, and guarded by the quantity
observed when the review began; stale reviews return a conflict instead of
overwriting another inspection. Accepted reviewed stock contributes to job
availability, while damaged quantities remain visible as shortages. Field
workers can see the office decision and evidence but cannot classify stock.
Recovery cases now distinguish material awaiting inspection from confirmed
damage and retain the decision trail. Migration 091 adds the review ledger and
backup verification requires its schema and idempotency index.

| Gate | Verified result |
| --- | --- |
| Backend and API | Focused receipt, recovery, backup and migration tests passed (91 passed, 2 PostgreSQL-dependent skipped). The full Node suite passed: 859 discovered, 812 passed, 47 skipped, 0 failed. |
| Frontend | Full Vitest suite passed: 43 files, 192 tests. Browser E2E passed for receipt registration, partial/damaged inspection, evidence history, mobile layout and axe checks. |
| Quality | Focused ESLint and `git diff --check` passed; production build completed during browser verification. |
| Release budget | `verify:bundle` remains failing: gzip 629893/578500 bytes, Brotli 544722/540000, client delivery 8551/8500, recovery case 3185/3000, replacement plan 1616/1600, recovery actions 1022/900. Limits were not raised. |
| Delivery boundary | No commit, push, deployment or provider action. |

| Gate | Verified result |
| --- | --- |
| Backend | Operational recovery domain, API and portfolio tests passed (23/23); deterministic priority rules are tested with a fixed clock. |
| Frontend | Full Vitest suite passed: 42 files, 188 tests, including Dutch triage badges and review actions. |
| Quality | Focused ESLint passed; Vite production build passed. |
| Delivery boundary | No external communication, schedule mutation, deployment, commit or push. |

## 2026-09-25 - Task Supervision Continuity

Work-plan tasks can now name a second, distinct worker as their supervisor.
Creation requires that person to have an active assignment on the same job and
that the selected supervision role match the recorded assignment. Resource
planning checks the supervisor's recorded availability, conflicts, work window,
site access and travel inputs alongside the assigned worker; solver constraints
prevent the supervisor from being placed on overlapping planned tasks. The
approved plan retains the named supervisor on the task. In the field pack,
supervised work is visible to both the assigned worker and named supervisor,
but starting it remains blocked until the supervisor has the required current
job assignment, full-window coverage, verified qualification and on-site check-in.
This is task-level continuity only; it does not establish statutory staffing
ratios or capacity for one person supervising multiple concurrent tasks.

| Gate | Verified result |
| --- | --- |
| Backend | Resource planner and field work pack tests passed (27/27), including named supervisor role, qualification, schedule overlap, approved persistence, field visibility and check-in release gate. |
| Browser | Work-plan browser checks passed (3/3) for mobile layout, material plan flow and office supervisor selection/persistence; field work-pack browser/axe check passed (1/1). |
| Quality | Focused ESLint passed; production bundle built during browser checks. The existing bundle-size budget was not re-run in this increment. |
| Delivery boundary | No deployment, commit, push or provider action. |

## 2026-09-25 - Supervisor Scope in Online and Native Field Packs

The named-supervisor work added in the prior increment exposed a field-surface
gap: a supervisor could see a supervised task and was also offered a progress
report control for it, although the server correctly rejected reports by anyone
other than the assigned worker. Online and Android work packs now label this as
supervisory-only, show who owns progress reporting, and omit the task from that
worker's progress selector. For the assigned worker, the online pack continues
to show the named supervisor and check-in. The Android snapshot labels check-in
as the state recorded at download time and tells the worker to refresh for a
current status; it is not presented as a safety release.

| Gate | Verified result |
| --- | --- |
| Backend and native source | Field work pack and offline/native source-contract tests passed (23/23). |
| Frontend | Field work pack React tests passed (18/18). |
| Browser | Production-bundle mobile field-work-pack test passed (1/1), including a supervisor-only task, report selector scope, blocker reporting and accessibility checks. |
| Quality | Focused ESLint and whitespace check passed; production build passed. Bundle budget remains over limit: gzip 630442/578500 bytes, Brotli 545194/540000, client delivery 8551/8500, recovery case 3189/3000, replacement plan 1617/1600 and recovery actions 1026/900. Limits were not changed. |
| Native release | APK/device build was not run: this checkout has no configured JDK or Android SDK. Source tests are not native compilation or phone acceptance. |
| Delivery boundary | No deployment, commit, push or provider action. |

## 2026-09-25 - Android Start-Release Receipt and Progress Gate

The native work pack now shows required start-release state per assigned
position and can record the named worker's explicit receipt confirmation through
the existing authenticated server route. The idempotency key is retained in the
encrypted vault before submission, and the app displays an active permission
only after the server returns an active release. The worker can also stop an
active or awaiting release online with a required reason; both the reason and
release-specific retry key are retained before submission, allowing a later
release on the same shift to receive a distinct idempotency identity. Starting progress for a
controlled task now requires a current online server check; cached release
state alone is insufficient. Blocker reports remain available offline.

| Gate | Verified result |
| --- | --- |
| Backend and native source | Field-pack, offline-vault and start-release API suites passed (25/25), including assignment-bound permission, expiry, revocation and blocker behavior. Native source-contract tests verify online receipt, stop-work and fail-closed progress paths. |
| Frontend reference | Field-work-pack React tests passed (18/18), including the equivalent online acknowledgment and required-release progress gate. |
| Quality | Focused ESLint and scoped whitespace check passed. |
| Native release | APK/device build remains unverified because JDK and Android SDK are not configured in this checkout. |
| Delivery boundary | No deployment, commit, push or provider action. |
# 2026-09-26 - Source-bound client completion review

- Added migration-backed client responses to the exact current, ready, delivered handover dossier: accept, accept with outstanding items, or not accepted.
- Bound responses to the issued package and current evidence/delivery hash; enforced portal approval/expiry, response limits, one response per package version, and idempotent replay.
- Added scoped client package download and portal form. Responses remain unreviewed, non-signature statements and do not update lifecycle, contract value, payment, or external commitments.
- Added an office-only closeout list, source-staleness indicator, operational export, client data-subject inventory/pseudonymization handling, and feature documentation.
- Verification: handover integration tests passed (2); the full Node suite passed (863 total, 816 passed, 47 PostgreSQL tests skipped); frontend tests passed (193); full ESLint and production build passed. Hosted PostgreSQL is not configured here; no live client or legal-acceptance test was performed.

# 2026-09-26 - Durable office review of client completion

- Added migration `093_client_completion_office_review` and append-only disposition history for follow-up, no further action, or escalation of an explicit client non-acceptance.
- Added role-gated office API and closeout UI with mandatory rationale, actor/time/source-current record, explicit stale-dossier acknowledgment, safe exact retry, audit evidence and export.
- Added data-subject inventory and pseudonymization of office notes; added Dutch labels. Reviews cannot change job status, contract, invoices, payments or external communications.
- Verification: complete Node runner passed 235 test files; focused handover API tests passed 2/2; frontend tests passed 193/193; ESLint and production build passed. No live PostgreSQL or legal acceptance was tested.

# 2026-09-26 - Cross-domain contractual closeout overview

- Added an office-only read assessment joining operational blockers, handover readiness/delivery, source-current customer completion response and disposition, formal variations/selections, reconciled customer receivables and supplier payables by currency, warranty, and aftercare.
- Added the closeout workspace summary, domain-specific statuses, linked open-record details, balance display, manual refresh, Dutch labels, and isolation from field-scoped accounts. The overview is read-only and explicitly leaves legal acceptance, contractual closure, and payment release undetermined.
- Verification: full Node suite passed (816 passed, 47 PostgreSQL-dependent skipped, 0 failed); frontend suite passed (195/195); focused closeout UI tests passed (2/2); operational/handover integration tests passed (3/3); ESLint and production build passed. Bundle verification remains over budget (gzip 636,816/578,500 bytes; Brotli 550,579/540,000; client-delivery gzip 8,547/8,500; recovery case 3,181/3,000; replacement plan 1,614/1,600; recovery actions 1,021/900); thresholds were not raised. PostgreSQL hosting/legal interpretation remain unverified.

# 2026-09-26 - Bind change impact to contract and customer decisions

- Added client selections to the durable impact-analysis source fingerprint and dossier review coverage. Approved customer-choice changes invalidate retained analyses; open requests remain visible without being mistaken for an approved scope change.
- Added source-current approved/pending scope context, decision status/selected option, and task-dependency edges to impact previews. No automatic choice-to-task or choice-to-quantity relationship is claimed.
- Updated commercial-scope source snapshots so verified approved/accepted/selected client outcomes participate only with an approved authorization record; preserve legacy explicit `approved` records.
- Verification: contractor-review API/domain and commercial-scope tests passed (18/18); full Node suite passed (817 passed, 47 PostgreSQL-dependent tests skipped, 0 failed); frontend suite passed (195/195); repository ESLint, Vite production build and the production Chromium desktop/mobile flow with axe passed. An unrelated work-board refresh test failed once in the concurrent run and passed both isolated and full-suite reruns.
- Bundle gate remains red without threshold changes: gzip 637,873/578,500 bytes; Brotli 551,436/540,000; client delivery 8,547/8,500; recovery case 3,183/3,000; replacement plan 1,615/1,600; recovery actions 1,023/900. Hosted PostgreSQL and legal acceptance remain unverified; no commit, push or deployment.

# 2026-09-26 - Explicit customer-decision impact links

- Added an owner/office API to link a client decision to active same-job tasks or material requirements. Required rationales are validated, exact sets are idempotent, and changes are recorded in the audit chain.
- Change-impact scenarios now identify only linked decisions affected by their task or material scope. The operator mapping editor is available before scenario calculation; saving refreshes the dossier and clears the old preview.
- Prevented internal mapping rationale from crossing the client-portal response boundary; portal writes return a public selection summary only.
- Verification: focused API/domain tests passed (16); role tests passed (6); client portal privacy test passed; full frontend suite passed (196); complete Node suite passed (818, with 47 PostgreSQL-dependent skips); lint passed; production-browser change-impact flow passed (1). Bundle budget remains over its unchanged thresholds: gzip 639,120/578,500 and Brotli 552,701/540,000 bytes, plus listed feature budgets in the delivery log. Hosted PostgreSQL and legal acceptance are unverified; no commit, push or deployment.

# 2026-09-26 - Trace change impact through purchase-order receipts

- Extended the source-bound change analysis through explicit material-requirement IDs to supplier order lines and receipt evidence. Same-name lines without an explicit material link are excluded.
- Exposed supplier, order state, due date, ordered/received/accepted/damaged/outstanding quantities. Draft orders remain visible but only issued orders with one retained external commitment count toward incoming material.
- Added receipt headers and lines to the impact source fingerprint so receipt changes stale retained reviews. No order, scope or schedule is changed automatically.
- Verification: focused contractor-review API/domain and material-receiving tests passed (22/22); frontend suite passed (196/196); full Node suite passed (819 passed, 47 PostgreSQL-dependent skipped, 0 failed); lint passed; production-browser change-impact flow passed (1/1) with accessibility scan. Bundle budget remains red at gzip 639,427/578,500 and Brotli 553,083/540,000 bytes (feature budgets recorded in the delivery log). PostgreSQL hosted parity and legal acceptance remain unverified; no commit, push or deployment.

# 2026-09-26 - Approval-bound SDS material links

- Added same-job active material requirement links to the governed SDS v2 source snapshot and replay fingerprint while retaining existing v1 snapshot validation. Revisions inherit the prior product links unless an operator explicitly supplies a different set.
- Restricted task-scoped worker work packs, field job details and global/job SDS lists to approved current SDS records linked to materials used by visible tasks; inactive material links are excluded. Added register checkboxes and material context in online/offline field views.
- Verification: focused Node/API work-pack/SDS suite passed (20/20); field UI tests passed (19/19); SDS register production browser flow passed (1/1); full ESLint passed; production build passed with existing 602 kB main-chunk warning. Hosted PostgreSQL parity and independent field acceptance remain unverified; no commit, push or deployment.

# 2026-09-26 - Material SDS applicability and pre-start gate

- Added audited per-material SDS applicability (`unreviewed`, `required`, `not_required`) with rationale, actor, stable replay keys, and an owner/approver-only exception. A pending or current linked SDS cannot be waived, and creating a mapped revision immediately changes the material to required.
- Added a field release blocker for unreviewed materials, missing current approved PDFs, and current PDFs omitted from the assigned pre-task safety plan; exposed readiness in the field pack and SDS register with Dutch field labels.
- Verification: three focused API/domain tests passed; field UI tests passed (20/20); SDS register browser flow passed (1/1); full ESLint passed before the final test-only addition; the production browser's Vite build passed with the existing 602 kB main-chunk warning. Hosted PostgreSQL parity and independent field acceptance remain unverified; no commit, push or deployment.

# 2026-09-26 - Field release source-integrity regression

- Fixed a projection defect that dropped integrity-invalid accepted variations from both the field scope and office-review list; the exact unverified text remains withheld, but the worker now sees a review warning and the start-release gate blocks.
- Replaced a test-only fabricated variation acceptance with the actual approval, provider-delivery receipt and acceptance-verification flow. Added a safety regression that changes material SDS readiness after a release and verifies the old worker-acknowledged release is no longer valid.
- Localized the new office material-SDS applicability controls through the saved Dutch/English operator preference.
- Verification: four focused backend/API files passed (18/18); focused field-work-pack and locale tests passed (25/25); SDS-register production browser workflow passed (1/1); full ESLint passed; production Vite build passed with the existing 602.04 kB app-chunk warning. PostgreSQL parity and independent site acceptance remain open; no commit, push or deployment.

# 2026-09-26 - Material shortage partial resequencing

- Resource previews now keep tasks with unknown or post-horizon material availability, plus their finish-to-start successors, out of proposed assignments while still scheduling independent work. Existing scheduled windows on held tasks remain blocked for their assigned worker.
- All-held work remains blocked; partial proposals explicitly show held tasks and reasons in the UI and retain those holds in independent approval evidence. The approved proposal only applies unaffected assignments and still revalidates the full current source hash.
- Verification: focused resource planner, project schedule and schedule approval tests passed (23/23); production-browser work-plan suite passed (8/8), including the partial material recovery workflow; production build passed with the pre-existing 602.04 kB main bundle warning. Hosted PostgreSQL parity and independent field acceptance remain open; no commit, push or deployment.

# 2026-09-26 - Escalate overdue recovery follow-ups

- Corrected company-wide recovery queue ordering so overdue follow-ups rise ahead of newer non-critical disruptions without outranking safety, integrity or immediate critical-path reviews.
- Verification: the recovery portfolio frontend suite passed (4/4). The local Disruptions workspace rendered successfully with empty development data; live overdue-case behavior is covered by the deterministic component test. No commit, push or deployment.

# 2026-09-26 - Assignment-specific opportunity capacity

- Fixed an unsafe bid-capacity assumption where one worker/day reservation could mask another overlapping retained assignment. Every active assignment in the forecast window now needs its own day allocation; otherwise that worker-day is treated as unavailable and the bid gate blocks on the resulting known shortfall/unknown commitment.
- Excluded allocations attached to assignments that are no longer active in the forecast window, and added assignment/job/task IDs to the source hash so relationship changes invalidate retained bid evidence.
- Verification: bid-decision, opportunity-pipeline and crew-capacity focused Node suites passed (20/20), including the two-overlapping-assignments regression. Full suite, hosted PostgreSQL parity and live operator acceptance remain unverified; no commit, push or deployment.

# 2026-09-26 - Integrated disruption recovery across domains

- Added an end-to-end ledger scenario linking a worker absence, short material receipt, accepted contractual completion date and approved actual cost through independent replacement, accepted replenishment, explicit case reassessment, client-date review, cost attribution and verified closure.
- The scenario exposed a production code path that queried the retired `worker_assignments` table when a historical absence was no longer active after replacement. Changed the lookup to the canonical `assignments` ledger and retained coverage in the combined workflow.
- Verification: six focused backend/API suites passed (48/48); three recovery React suites passed (22/22); production-browser operational-recovery workflows passed (5/5), including the combined dashboard closure. Full suite and PostgreSQL parity remain unverified; no commit, push or deployment.

# 2026-09-26 - Restore interrupted recovery-cost attribution drafts

- Extended recovery cost-impact session drafts to include actual-cost source selection, amount, rationale and a pending correction target. The existing same-operator and case/source-hash scoping prevents a draft from carrying over to changed evidence.
- Added a component restart regression that restores an unsubmitted allocation and verifies the resulting API command uses the selected, still-current approved source.
- Added a combined recovery browser journey and fixed a stale-case race: after a sub-review, recovery actions now stay unavailable until the updated case and source hashes have loaded.
- Verification: focused recovery React suites passed (22/22); operational-recovery production browser suite passed (5/5); repository lint, production build and release contract passed. The existing production bundle warning remains at 602.04 kB for the main app chunk. Full suite and PostgreSQL parity remain unverified; no commit, push or deployment.

# 2026-09-26 - Analyze complete customer-visible conversation history

- Expanded local conversation analysis from the latest 30 messages to the complete retained customer-visible history, paged oldest-to-newest with a 1,000-message/2 MB fail-closed limit and bounded serial model windows. Unpublished office drafts are excluded; only inbound customer messages and published replies form the AI evidence basis.
- Increased the durable analysis lease to accommodate serial bounded windows, filtered vision submissions to inbound photos, and surfaced the model batch count in the office conversation review.
- Source links now page older conversation entries into the timeline before scrolling to the exact cited message/photo.
- Verification: conversation domain/analysis tests passed (24/24), including fail-closed message/evidence-size limits; conversation API route test passed (1/1); conversation UI tests passed (15/15), including navigation to a cited message outside the initially loaded page; targeted ESLint and production build passed (existing 602.04 kB app-chunk warning). PostgreSQL queue parity was skipped because no PostgreSQL test database is configured; full repository tests and live local-model interpretation remain unverified. No commit, push or deployment.

# 2026-09-26 - Durable worker notification inbox

- Added a migrated, worker-scoped notification inbox for standby call-outs, position offers and confirmed placements. The worker board shows unread counts and notification details, links to the relevant work area, and marks notices read through an idempotent authenticated endpoint. Offers now carry day/time, duration, location and response expiry; confirmed placements include the assignment's address, planned hours, a direct anchor to the worker's placement list, and an explicit warning that placement is not authorization to start. Notices remain retained across browser refreshes and server restarts; one worker cannot inspect or mark another worker's notice read.
- Verification: focused work-board domain/API/standby call-out tests passed (26/26); work-board component tests passed (12/12); the production-bundle mobile worker workflow passed (1/1), including the rendered notice details and anchor navigation; targeted ESLint passed; Vite production build passed with the existing 602.04 kB main-chunk warning. PostgreSQL parity, native device acceptance and background/external push remain unverified. No commit, push or deployment.

# 2026-09-26 - Encrypted offline worker notification snapshot

- Added a bounded, privacy-minimized worker inbox snapshot to the existing encrypted offline vault. It shows saved messages with their saved-time/read state and a clear stale/offline warning; it does not expose action links or permit offline acceptance. Saving a work pack captures the current inbox, and explicit online synchronization refreshes it after the response queue. Scoped role-token sessions are authorized by their authenticated worker ID; unlinked owner and foreign-worker access remains denied.
- Verification: offline snapshot and rendering suites passed (7/7); work-board API authorization suites passed (2/2), including named field-worker scope and owner denial; production-bundle mobile offline workflow passed (1/1), including initial snapshot, offline reopen and explicit-sync refresh. Production build succeeded with the existing main-chunk warning. PostgreSQL and native-device acceptance remain unverified; no commit, push or deployment.

# 2026-09-26 - Notify workers when standby call-outs change state

- Made call-out revocation caused by a newly reported worker unavailability atomic with the availability ledger update and worker inbox notice. Actual lazy expiry now also creates one durable notice. Messages include only the job, trade, work window and safe status explanation; personal availability reasons are not copied into the notification.
- Added API/domain regressions for the revoked and expired paths, including idempotent expiry notice creation and private-reason exclusion.
- Verification: focused work-board domain and standby API suites passed (25/25); targeted ESLint passed. PostgreSQL parity, native-device acceptance and background push remain unverified. No commit, push or deployment.

# 2026-09-26 - Deliver approved office answers to field workers

- Connected the existing worker question -> retained field report/RFI -> office response -> approval path to the durable worker inbox. Only an approved answer to a worker-originated work-pack RFI creates a notice, atomically with approval; it is idempotent and excludes internal review notes. Pending/rejected or unrelated RFIs do not notify.
- Added migration 095 to extend the notification type while retaining existing SQLite inbox rows; PostgreSQL uses a targeted check-constraint replacement. Added API coverage for answer privacy, role isolation and duplicate approval, plus a forward-migration preservation test and UI coverage for the answer notice.
- Verification: focused field-pack, work-board and approval suites passed (47/47); worker notification component tests passed (12/12) and targeted ESLint passed. PostgreSQL migration execution, native-device acceptance and background push remain unverified. No commit, push or deployment.

# 2026-09-26 - Prove dossier-review source coverage

- Added a versioned coverage manifest to every portfolio dossier report: row counts for all 15 configured job-scoped source tables, presence checks for seven derived source sets and a record of ten evaluated controls. Sweep completion now requires current-manifest evidence for every dossier and zero failed/incomplete reports; older interrupted progress is restarted instead of being upgraded implicitly.
- The dashboard now shows manifest scope and flags dossiers missing coverage evidence. Updated the operating-model boundary: this proves only manifest v1, not every ledger domain or certification; cursor-paged reads for very large registers remain open.
- Verification: contractor-review/domain/API tests passed (18/18), review-control frontend tests passed (9/9), targeted ESLint passed. Hosted PostgreSQL and production acceptance remain unverified. No commit, push or deployment.

# 2026-09-26 - Scope approved JHAs to field tasks

- Added integrity-bound task links to JHA safety definitions and approval evidence. Task-scoped field projections now include only approved, intact JHAs linked to visible tasks and return only overlapping task IDs; the online and encrypted offline work packs display the bounded hazards, controls, method, PPE and stop-work triggers. Legacy unlinked JHAs are retained for unscoped assignments but are not implied to cover a new position task scope.
- The field-assurance queue detects position tasks without verified linked JHAs. Its existing safety-pack action creates a new linked draft when coverage differs, carrying earlier hazards/controls forward only for fresh human review.
- Verification: focused field work-pack, field-assurance and API tests, component tests, production-bundle mobile browser flow, ESLint and diff check pass. Hosted PostgreSQL parity and independent field-device/site acceptance remain unverified. No commit, push or deployment.

# 2026-09-26 - Review task-level JHA applicability before release

- Added a task-specific applicability decision so office staff must record whether a field-visible task needs a JHA. The decision is bound to the task's safety-relevant source fields; edits invalidate it for review. Only an owner/approver may waive a JHA, with a recorded rationale. The field pack exposes status but not office rationale, and start release is blocked until applicability is reviewed and any required approved, task-linked JHA is included in an assigned pre-task plan. The assurance queue now checks tasks actually visible to active field assignments.
- Verification: focused API/domain tests passed (17/17), office/field UI tests passed (22/22), targeted ESLint and production build passed, and the production-bundle mobile field-work-pack browser test passed (1/1). Build retains the existing large-main-chunk warning. Hosted PostgreSQL parity and independent field-device/site acceptance remain unverified. No commit, push or deployment.

# 2026-09-26 - Bind each safety plan to the task it covers

- Closed a release-gate gap: merely finding the right JHA on any plan assigned to a worker no longer qualifies a different task for start. Office selects the task subset covered by the JHA; new plan version-two approval snapshots freeze that selection and exact JHA, and source-current checks revalidate it. The field projection returns only overlap with that worker's visible tasks. Existing version-one plans remain integrity-readable but acquire no assumed task coverage; they must be replaced with a reviewed scoped plan before satisfying a task-specific gate.
- Added regressions for scope tampering, JHA/task mismatch, safe legacy snapshot reads, API release blockers and the office task-scope editor.
- Verification: focused API/domain suites passed (23/23), including a reconstructed version-one plan approval that remains source-current and resolves without inferred task coverage. Office/field component tests passed (23/23), targeted ESLint and `git diff --check` passed; production build and mobile field-work-pack E2E passed (1/1). The build retains the existing 602 kB main-chunk warning. Hosted PostgreSQL parity and independent field acceptance remain unverified. No commit, push or deployment.

# 2026-09-26 - Automate opted-in waitlist offers

- Added an immutable per-position `automatic_once` waitlist policy, defaulting to manual. The enabled durable autonomous cycle offers one expiring in-app portal offer to the oldest eligible waitlisted worker when a slot opens. It blocks parallel offers, rechecks current source/materials/admission/qualifications/availability, and stops for owner review rather than skipping or repeatedly offering after a decline, expiry or eligibility issue. Placement still requires worker acceptance and the existing checks; no email, WhatsApp, final placement or approval bypass is added.
- Added owner-visible queue status, UI opt-in, lifecycle documentation, worker-facing privacy assertions, and regressions for vacancy, ordering, repeat sweeps, decline, admission blockers and manual default. Corrected the public-position audit row to reflect retrospective privacy checks.
- Verification: work-board domain tests passed (33/33); office component tests passed (18/18); targeted ESLint and production build passed; the existing work-board browser suite passed (4/4). Build retains the existing 602.96 kB main-chunk warning. Hosted PostgreSQL concurrency, enabled-scheduler live operation and independent contractor/worker acceptance remain unverified. No commit, push or deployment.

# 2026-09-26 - Offer standby coverage after a reported absence

- Added an off-by-default, immutable position opt-in. When an assigned worker records an overlapping absence, the durable autonomous cycle may create one short-lived portal-only offer for the first qualified, admitted standby worker who independently declared availability. It rechecks current source, qualification, availability and notice; existing offers prevent repeats. Decline, expiry and unsafe or stale conditions stop for owner review instead of advancing to another candidate.
- Added contractor controls and status feedback, suppressing parallel manual offers while an automated offer is pending. Worker-visible position projections omit the internal policy. Acceptance does not replace the assignment; contractor-initiated replacement and existing separate approval remain required. No external messaging is sent.
- Added a cross-assignment overlap guard so one standby worker cannot receive simultaneous offers for conflicting shifts in separate jobs. Acceptance excludes its own offer from the collision check, while still rejecting other overlapping open/accepted callouts.
- Verification: full work-board domain suite passed (35/35), including notice, opt-in replacement, and cross-job overlap cases. Office UI tests passed (19/19), targeted ESLint, planner API integration, work-board browser workflows (4/4), and production build passed. The build retains the existing 602.96 kB main-chunk warning. Live scheduler enablement, PostgreSQL concurrency and independent contractor/worker acceptance remain unverified. No commit, push or deployment.

# 2026-09-27 - Recover drawing revision form drafts

- Added bounded session-only recovery for drawing revision metadata, isolated by operator session and job. The drawing PDF remains outside browser storage and must still be available as checksum-bound server evidence when the revision is submitted; the backend remains authoritative for validation and approval.
- Added component regressions for restoration scope and disabled recovery. This does not provide cross-device, long-term, or offline PDF recovery, and other internal forms are not universally covered.
- Verification: drawing revision draft component tests passed (2/2), targeted ESLint passed, production build passed with the existing 602.98 kB main-chunk warning. Live multi-device recovery and hosted deployment remain unverified. No commit, push or deployment.

# 2026-09-27 - Route client conversation contradictions to accountable review

- Closed an actionable gap in the client conversation loop: a current AI finding classified as a contradiction can now be converted into a named, deadline-bound internal RFI. The exact customer quote, source hash, analysis identity, suggestion and uncertainty remain attached; staff must define the comparison question. This does not decide disputed scope or price and sends nothing to the customer.
- Added backend idempotency, source-integrity and audit coverage, plus a UI regression; other analysis categories remain ineligible for this RFI route.
- Verification: client-conversation domain suite passed (8/8), conversation component suite passed (15/15), authenticated conversation API integration passed (1/1), targeted ESLint passed and production build passed with the existing 602.98 kB main-chunk warning. No live model/provider acceptance, commit, push or deployment.

# 2026-09-27 - Return approved RFI answers to the originating client chat

- Connected approved responses from customer-originated RFIs back to their exact portal conversation. Office can prepare the approved answer verbatim as a reply to the source message; the retained draft binds the RFI, approval, response hash, source message hash and current analysis identity. New customer context makes the handoff unavailable until reassessment. Message approval and publication remain separate, and WhatsApp is not invoked.
- Added role-scoped list/create routes, idempotent draft creation, direct timeline refresh, and domain/UI/API coverage for approval gating, source freshness, privacy, audit integrity and duplicate prevention.
- Verification: client-conversation domain suite passed (9/9), conversation component suite passed (16/16), authenticated conversation API integration passed (1/1), targeted ESLint passed and production build passed with the existing 602.98 kB main-chunk warning. Live WhatsApp/provider delivery and production acceptance remain unverified. No commit, push or deployment.

# 2026-09-27 - Quarantine field-reported unsafe equipment

- Added a field-to-office equipment recovery path. A worker can report malfunction, damage or unsafe condition only for a reservation in their own active physical custody. The report is retained with task, worker, custody, source and audit identity; an open hold blocks new reservations and direct status changes, and return does not clear it. Only a passing office inspection or completed maintenance record can release the equipment.
- Connected online work-pack reporting, encrypted browser offline response queues and the native Android work-pack's encrypted local queue to the same API validation and recovery case. The office recovery case shows the scoped report and keeps the hold visibly unresolved until formal evidence is recorded. No external message or autonomous release occurs.
- Verification: authenticated work-pack API integration passed (1/1), React work-pack tests passed (22/22), OfflineField tests passed (4/4), targeted native/offline safety tests passed (3/3), the four Node suites passed (52/52), targeted ESLint passed, and the production build passed with the existing 602.98 kB main-chunk warning. The local API was restarted on the same isolated temporary data directory and health/readiness checks passed. Android APK compilation could not run because no Java/JDK is installed in this environment. Hosted PostgreSQL parity and independent field-device/site acceptance remain unverified. No commit, push or deployment.

# 2026-09-27 - Verify subcontractor membership for targeted positions

- Added owner-controlled linkage from worker accounts to active subcontractors in the existing trade-partner register. The link stores an audit reference and is not accepted from public registration; a declared-name mismatch requires a separate explicit owner identity-review confirmation and is audited.
- Added optional company targeting to position drafts/releases and enforced membership in worker-visible listings, enrollment checks, direct enrollment and final placement checks. Existing accounts may be linked after admission; unassigned historic applications are masked if their account no longer matches the target.
- Added office controls and API/domain/UI regression tests. Verification passed: work-board and authenticated API tests (38/38), office UI tests (22/22), targeted ESLint, and Vite production build. Existing 602.98 kB main-chunk warning remains. Company isolation outside this position/recruitment path, hosted PostgreSQL parity and independent field acceptance are still open. No commit, push or deployment.

# 2026-09-27 - Preserve subcontractor boundaries through recovery

- Snapshotted required subcontractor identity onto position-linked assignments and preserved it through proposed replacement assignments and further replacement plans. Current active owner-verified membership is checked during candidate search, replacement request and independent approval; standby offers use the same scope.
- Kept contractor-directed overlapping standby offers available for coordination while making the autonomous sweep exclude a worker with another open overlapping offer. Worker acceptance still rejects overlapping commitments.
- Verification: focused work-board, standby, replacement and workforce-availability suites passed (60/60); targeted ESLint passed. Hosted PostgreSQL parity, full company-data isolation and independent subcontractor acceptance remain open. No commit, push or deployment.

# 2026-09-27 - Revoke targeted assignment details when company verification changes

- Rechecked active verified subcontractor membership when named field workers list or retrieve work packs, read field job projections, and receive assignment-specific notifications. On suspension or membership mismatch, private assignment details are withheld; messages become generic. Directed offers and standby call-outs remain visible only to their intended currently eligible worker.
- Kept explicit legacy job-ID role tokens read-scoped, but removed the temporary pseudo-worker identity: production mutations require a real named worker. Updated the auth regression to assert this fail-closed behavior.
- Verification: focused work-board and field-work-pack Node/API suites passed (60/60), the targeted legacy-role auth regression passed, and ESLint passed for touched server/domain/test files. Broader company-data isolation, hosted PostgreSQL parity and independent field acceptance remain open. No commit, push or deployment.

# 2026-09-27 - Enforce company scope across mixed project assignments

- Filtered field project assignment projections through active status and current company verification, and made project-detail projection enforce its own access check. Other active position-linked tasks now activate restrictive task visibility even when the worker also has an unscoped assignment; task-linked material, drawing and safety projections inherit that restriction.
- Closed explicit legacy job-ID allowlist access to any job with active company-targeted work or an open targeted position. Added a production-auth API regression plus SQLite-backed company-scope and mixed-task regressions.
- Verification: focused field-work-pack, work-board and new company/task-scope tests passed (61/61); the targeted legacy-role API test passed (1/1); ESLint passed. Non-task-linked evidence, other company-owned data, PostgreSQL parity and independent acceptance remain open. No commit, push or deployment.

# 2026-09-27 - Restrict field evidence downloads to verified routes

- Generic document content is no longer downloadable by field workers except for current, approved drawings present in their scoped work pack. Revalidate the drawing scope and retained file identity after storage reads; SDS and submittal PDFs remain available only through current source-hash-bound work-pack routes. Limit raw field job document metadata to visible drawings and current SDS documents linked to visible materials.
- Added regressions for arbitrary document denial and generic SDS download denial. Updated stale migration assertions in drawing/SDS tests from 093 to the actual current 095 migration.
- Verification: focused field-work-pack, SDS revision, drawing revision, asset-history and inspection-coverage API test files passed (5/5); targeted ESLint passed. Complete evidence access inventory, hosted PostgreSQL parity and independent field acceptance remain open. No commit, push or deployment.

# 2026-09-27 - Scope field-readable project collections

- Reused the field job projection as the allowlist for collection reads across work permits, pre-task plans, LMRA, installation QC, photo evidence, safety meetings, attendance, daily cycles, materials, equipment, expenses, daywork, environmental activities and nonconformances. Material receipt plans now filter lines and recompute summaries from the worker-visible material requirements. Cached projections per request to avoid repeatedly loading the same job detail.
- A new API regression exposed peer-worker NCR metadata in a field project projection where the task link was incomplete. NCRs now require matching worker/assignment scope as well as task visibility; the field-work-pack API test confirms a peer finding and reporter identity stay hidden.
- Verification: `tests/field-work-pack-api.test.js` and `tests/site-attendance-api.test.js` pass; `node --check server.js`, targeted ESLint and `git diff --check` pass. Broader existing APIs stop on stale migration-version assertions (expected 093, current 095); the daily-cycle API test also expects field access for a `scheduled` assignment, rejected by the current active-assignment policy. Full collection inventory, PostgreSQL parity and independent field acceptance remain open. No commit, push or deployment.

# 2026-09-27 - Bind field mutations and material receipts to work-pack scope

- Field task lifecycle changes now resolve the target task through the canonical verified worker projection, rejecting peer tasks and unassigned tasks outside the worker's released position. Field material receipts reject any line whose material requirement is absent from that worker's current work pack; company-warehouse receipt remains unavailable to field workers.
- Job-site stock receipts now require that the delivery's material requirement be visible to the worker. The field response contains only the current worker's receipt plus the minimum issue totals needed by the offline work pack; it omits internal allocation identifiers and other workers' receipt/evidence rows. Idempotent replay must resolve to a receipt authored by the same authenticated operator.
- Regression coverage proves peer task transition and peer material receipt denial and confirms that a prior office receipt is absent from a field worker's response. Verification: focused field-work-pack, shared-stock and material-receiving API tests pass (3/3); `node --check server.js`, targeted ESLint and `git diff --check` pass. Local API readiness and dashboard HTTP checks pass. Broader migration assertions, full field access inventory, PostgreSQL parity and independent site acceptance remain open. No commit, push or deployment.

# 2026-09-27 - Enforce task scope across remaining field evidence writes

- Added one recursive validator for task references in nested field payloads and applied it to general progress, time/daily logs, daily cycles, daywork, NCR, environmental activity, observation, incident, punch, safety-check and field-report writes. Field evidence reports and incident reports attribute the authenticated worker rather than caller-supplied names.
- Field evidence uploads now reject task references outside the worker's work pack and reject photo-evidence sets not present in that pack before accepting the upload. Upload-generated ledger actions retain the authenticated operator as their audit actor rather than the generic `upload_api` label.
- Added API regressions for peer-task updates through the legacy general-progress endpoint and attempts to attach evidence to an inaccessible photo workflow. Verification: focused field-work-pack, shared-stock and material-receiving suites pass (3/3); `node --check`, targeted ESLint and `git diff --check` pass. Complete route/payload inventory, broader regression suite, PostgreSQL parity and independent field acceptance remain open. No commit, push or deployment.

# 2026-09-27 - Bind end-of-day and safety attendance to retained assignment

- Daily cycle reads now include only cycles whose retained crew contains the authenticated worker. End-of-day submission requires that worker to be the cycle's retained lead; a worker cannot close another crew's cycle by guessing its ID. Safety briefing acknowledgements require the briefing to be present in the worker's assignment-filtered projection before recording attendance.
- Added peer-cycle and peer-briefing API regressions. Updated the daily-cycle fixture to use a currently active assignment and corrected its dashboard/export/migration expectations to match current behavior and migration 095. Verification: daily-cycle and field-work-pack API suites pass (2/2), targeted ESLint passes. Broader API suite, hosted PostgreSQL parity, native acceptance and independent field acceptance remain open. No commit, push or deployment.

# 2026-09-27 - Bind inspection and equipment actions to field scope

- Checklist submission now requires an authenticated worker identity and an inspection visible in that worker's current work pack; installation QC capture remains bound to its assigned worker and authenticated approval policy. Field job-scoped legacy tokens may read installation-QC controls only for explicitly allowed job IDs; QC projection identity supports inspectionId-only records.
- Equipment checkout now requires a reservation present in the field work pack. Return requires the retained custody session to identify the authenticated worker as its holder. Added guessed peer inspection and peer custody-return regressions.
- Verification: focused field-work-pack, installation-QC, equipment-custody, photo-evidence, LMRA, managed-operator-access and static-performance suites pass (15/15). Full Node suite passes (926 tests: 879 pass, 47 skipped, 0 fail); full ESLint passes; API readiness reports database and evidence storage ready; local dashboard returns HTTP 200. PostgreSQL-hosted tests are among the skips, and independent field acceptance remains open. No commit, push or deployment.

# 2026-09-27 - Require worker acceptance before office-originated placement

- The legacy office confirmation action can no longer turn an interested or waitlisted application directly into a planned assignment. Existing assignments remain idempotent; open interest requires a revision-bound offer and explicit worker acceptance. An admitted worker can still enroll directly into a currently ready, available published position.
- Updated standby, waitlist and material-readiness tests to prove the offer/acceptance route, and added an API regression ensuring office confirmation leaves worker interest unchanged. Verification: work-board domain/API suites pass (40/40); targeted ESLint passes. PostgreSQL parity and independent operator acceptance remain open. No commit, push or deployment.
# 2026-09-27 - Correct operational recovery portfolio filters

- Corrected the cross-job recovery filters: `Actie nodig` now selects missing/overdue follow-ups, stale or unverifiable sources, unresolved materials, open quality cases, unavailable equipment and other active operational impacts; `Monitoren` selects items without those attention conditions. The previous `Opvolgen` filter was inverted and showed the latter group.
- Added component regressions for both categories and retained attention-first sorting. Verification: focused React tests passed (4/4), targeted ESLint passed, and the production build passed with the existing 602.98 kB main-chunk warning. Broader recovery completeness, hosted PostgreSQL parity and independent operator acceptance remain open. No commit, push or deployment.

# 2026-09-27 - Require current weather evidence for the planned start

- Schedule readiness now checks that the latest weather assessment was captured within 12 hours and targets a forecast time within one hour of the proposed start. Stale or non-comparable weather cannot clear outdoor-job readiness; a current matching assessment also recognizes explicit unsafe, heat, wind, storm and visibility states rather than looking only at precipitation. The office form ties its assessment to the currently selected planned start, and the company-wide weather summary marks stale data instead of presenting it as workable.
- No dates are moved, no provider result is implied, and no assessment grants site safety clearance. Verification: weather readiness/provider/API suites pass (7/7); the existing full-ledger dispatch API acceptance test passes; targeted ESLint passes; Vite production build passes with the existing 603.18 kB main-chunk warning. Hosted PostgreSQL parity and real forecast/field acceptance remain open. No commit, push or deployment.

# 2026-09-27 - Route approved client answers to affected field tasks

- Office can opt a current customer-message/photo RFI into field sharing and select active tasks. The exact RFI answer remains private until its approval resolves; the worker projection contains only the title, approved response, matching task titles and answer time, never the customer quote or AI analysis. Active access, current source/analysis and current worker task scope are rechecked on every pack read.
- The exact-answer approval summary names the receiving task titles and retains those IDs in approval data, so the approver can see the planned audience.
- The update contributes to the work-pack source hash, so changed acknowledgement/start-release state follows existing revision gates. The worker-facing notice explicitly says this is not a scope/date/safety change or permission to start. This does not send or publish a customer message.
- Verification: client-conversation tests passed (9/9); field-work-pack tests passed (20/20), and the focused end-to-end RFI/approval/audience/acknowledgement regression passed again after the approval-preview change; conversation UI tests passed (16/16); field-work-pack UI tests passed (23/23); targeted ESLint and backend syntax checks passed; production build passed with the existing 603.18 kB main-chunk warning. PostgreSQL parity and independent office/field acceptance remain open. No commit, push or deployment.

# 2026-09-27 - Notify field workers of approved client updates

- The customer-RFI approval path now creates a durable task-specific worker inbox notice for each currently assigned worker whose live field scope intersects the selected tasks. Notice text contains no customer quote, answer, attachment or AI analysis. Inbox reads revalidate the current portal/source and task authorization; changed sources sanitize older notices. The approval also changes the pack source hash, so workers must refresh before subsequent source-bound field actions.
- Added a domain regression for audience filtering, idempotency and stale-notice sanitization, plus API integration through the real approval endpoint and worker inbox. Verification: work-board, field-work-pack API and client-conversation suites pass (49/49); targeted ESLint and Node syntax checks pass. No external notification, commit, push or deployment.

# 2026-09-27 - Prepare approved field reports for client conversations

- Connected approved client-visible field reports to the same-job customer conversation. Office users can select a current report, edit its work summary into a private chat draft, and review the exact report source in the office timeline. The client projection excludes the internal source reference and workforce details.
- The draft is idempotent and source-version-bound. Approval and explicit publication remain distinct; current report approval, client-visible status and active portal access are revalidated at both transitions. Stale content or revoked portal access cannot be approved/published. No WhatsApp/email transport is invoked.
- Verification: client-conversation domain/API suites pass (11/11), including exact retries, role separation, portal revocation, approval-preview details and report mutation rejection. Conversation UI suite passes (17/17); targeted ESLint and backend Node syntax checks pass; production Vite build passes with the existing 603.18 kB main-chunk warning. PostgreSQL parity and independent operator acceptance remain open. No commit, push or deployment.

# 2026-09-27 - Refresh approved replies in the native worker app

- The Android app now polls the authenticated, assignment-scoped `work-pack/replies` feed every 30 seconds only while the selected work pack is visible, online and the activity is resumed. Newly approved answers are merged into the existing encrypted vault and announced through a polite accessibility status line without re-rendering the current task screen. Polling stops on navigation, activity pause or destruction; no background worker or push notification was added. Authorization expiry pauses polling and asks the worker to sign in again.
- Added `ACCESS_NETWORK_STATE` and native-source contract coverage. Verification: offline Android/work-pack source suite passes (14/14); authenticated field-work-pack API integration passes (1/1). This environment has no JDK, Android SDK or adb; SDK terms have not been accepted, so native compilation/device acceptance are not claimed. No deployment, commit or push.

# 2026-09-27 - Share released field photos with customers

- The office conversation now lists only current, intact, independently approved and released photos from the same job, and can turn a selected image plus an edited customer message into a private chat draft. The draft reuses the existing private evidence document rather than copying its bytes. Office-only provenance binds the message to the evidence set, current capture, approval and document checksum; approval and publication both revalidate that origin.
- Client message and photo remain hidden until separate communication approval and explicit publication. The customer projection omits evidence IDs/hashes; its photo URL remains authenticated and token-scoped, checks stored bytes against SHA-256 and sets `no-store`. The approval view identifies the work-photo source and keeps external sending separate.
- Verification: conversation domain suite passes (11/11), including release, private-before-publish, reuse of the original document and stale-hash approval rejection; conversation UI suite passes (18/18); conversation route API suite passes (1/1), and the photo-evidence API exercises the complete release-to-client retrieval path including authenticated media checksum verification (1/1). Targeted ESLint, backend syntax checks and production Vite build pass. PostgreSQL parity and independent office/customer acceptance remain open. No commit, push or deployment.

# 2026-09-27 - Restrict field project RFI visibility

- The generic field job-detail response previously included office RFIs and unapproved client questions even though worker replies and explicit client-to-field sharing already had separate source-bound paths. Field workers now see their own work-pack questions, plus only approved client-conversation answers explicitly shared to tasks in their current verified work scope. Office-only, pending and peer-task RFI content stays out of that projection.
- Added API regression coverage for hidden office/pending questions, visibility of a current approved own-task answer, and exclusion of an approved peer-task answer. Verification: the real field-work-pack API suite passes (1/1); broader field record/company isolation and PostgreSQL parity remain open. No external notification or communication, commit, push or deployment.

# 2026-09-27 - Bind field incident reports to verified worker and task

- Field incident submissions now overwrite reporter identity from the authenticated worker account, and the ledger preserves that identity plus an optional same-job task ID. Cross-job task references are rejected; task and reporter identity are part of the retry hash, preserving legacy retry hashes when those optional fields are absent.
- Generic field project detail now exposes incident records only when they are attributed to that worker and remain within the worker's current task scope. Unattributed legacy records fail closed for field access while office users retain the complete incident register.
- Verification: `tests/field-work-pack-api.test.js` and `tests/field-risk-replay.test.js` pass (5/5), including spoofed reporter, own/peer record separation, cross-job task rejection, same-job retry conflict and exact replay. Broader company isolation and PostgreSQL parity remain open. No external communication, commit, push or deployment.

# 2026-09-27 - Enforce standby notice on position offers

- A standby worker's overlapping position interest still enters review without creating an assignment, but the concrete offer now respects the worker's retained minimum notice. The response deadline cannot pass the latest safe acceptance time, and the authoritative placement path checks the deadline again against current standby terms.
- If the minimum notice is already impossible, no offer is issued; the interest stays open for office follow-up and no assignment is created. No medical or family reason is collected, and existing commitments are not changed.
- Verification: `tests/work-board.test.js` and `tests/workforce-availability.test.js` pass (56/56); ESLint and `node --check work-board.js` pass. Hosted PostgreSQL and independent worker acceptance remain open. No external communication, commit, push or deployment.

# 2026-09-27 - Add recurring worker availability

- Added bounded weekly availability patterns with selected weekdays, explicit IANA timezone and a final date (maximum 366 days). The worker portal and office form submit the pattern; summaries expose its next occurrence. Wall-clock start/end times are preserved across DST offset changes, and nonexistent local times are rejected rather than silently shifted.
- Connected generated occurrences to assignment conflicts, availability summaries, opportunity capacity, daily crew-capacity views, standby matching, callout response, and final replacement approval. A recurrence is retained as one auditable period; cancellation still requires approval for the whole series, and one-off exceptions remain separate periods. No healthcare reason is collected and no existing commitments move automatically.
- Weekly patterns require an explicit IANA time zone in both user experiences; selectable European zones are shown, local inputs are converted according to that selection, and nonexistent spring-forward times are rejected before submission.
- Verification: recurrence/availability, crew-capacity, and work-board Node suites pass (69/69), including a later-week standby callout through replacement approval; worker portal/timezone component tests pass (6/6); workforce-availability browser tests pass (3/3); targeted ESLint and production Vite build pass. Hosted PostgreSQL parity, full CI, and independent field acceptance remain open. No commit, push or deployment.
## Phase 186: Concurrent Same-Trade Task Crews

Tasks can now record a required crew size from one to twelve for their explicit
trade. Resource planning chooses distinct qualified workers who can all cover
the same task window, while retaining each worker and supervisor as an exclusive
resource across concurrent tasks. An already approved crew remains fixed with
its protected task schedule; if a crew member becomes unavailable or unqualified,
replanning stops for review instead of swapping the person silently.

The proposal carries every worker through independent approval and source-current
revalidation. Approval persists the exact crew on the task, and each crew member
gets the shared task in their own field work pack with access to their personal
start-release checks. Tasks without an explicit crew size continue to require one
worker.

| Verification | Result |
| --- | --- |
| Focused Node coverage | 42 passed across resource planning, field task scope and work packs. |
| Browser | Production-bundle multi-worker task setup and planning workflow passed (1/1). |
| Build and lint | Production build and targeted ESLint passed. |
| Remaining boundary | Mixed-trade definitions and roles are implemented in phase 187; supervision ratios, hosted PostgreSQL parity and independent field acceptance remain open. |

## Phase 187: Mixed-Trade Task Crews

Task planning now accepts up to eight distinct trade groups and twelve total
workers, with a required count for each role. The planner only selects workers
with a matching active job assignment and current required qualifications. Its
solver reserves the whole crew for the same task window and prevents the same
person from satisfying multiple trade slots at once or from being double-booked
on another task. Approved schedules preserve each worker-to-role assignment;
approval revalidates the exact crew composition and rejects duplicate workers,
altered roles or unavailable members.

The office task form supports adding and removing trade groups. Resource-plan
previews identify each worker and trade. The scoped mobile work pack shows the
named crew and each person's role alongside the shared task. Older single-trade
tasks and the `requiredTrade` / `requiredCrewSize` input contract remain
supported.

| Verification | Result |
| --- | --- |
| Focused Node coverage | 42 passed across resource planning, field task scope and work packs; includes mixed-role allocation, approval tampering, invalid role groups and team-size limits. |
| Field-pack UI | 24 passed, including the visible mixed-trade crew and role labels. |
| Browser | Production-bundle mixed-trade task setup and planning workflow passed (1/1). |
| Build and lint | Production build passed; targeted ESLint passed for implementation, API, Node tests and browser test files. |
| Remaining boundary | Supervision ratios are implemented in phase 188; hosted PostgreSQL parity, full-repository CI and independent field acceptance remain open. |

## Phase 188: Configurable Supervision Ratios

Task setup can now define an explicit maximum number of workers per supervisor
and select the named supervisors. The required supervisor count is calculated
from the complete task crew, across mixed trades. A missing ratio remains
unknown/unconfigured; the application does not invent a legal or contractual
default. The ledger validates named job assignments, matching supervisor roles,
distinct identities and a sufficient number of supervisors.

Planning verifies every named supervisor's active assignment, availability,
mandatory qualifications and overlap with the full task window. The Z3 model
reserves each supervisor once per task, includes them in cross-task no-overlap,
and rejects proposals that remove or alter part of the named supervisor set.
Approval persists the ratio and identities. Field task scope includes each
designated supervisor; the work pack shows names, qualification/shift/check-in
state and the configured ratio. Start release checks every named supervisor's
assignment, qualifications and shift, and requires at least the computed
headcount to be checked in on site.

| Verification | Result |
| --- | --- |
| Focused Node coverage | 43 passed across resource planning, task validation, field scope and work packs, including a two-supervisor ratio and proposal-tampering rejection. |
| Field-pack UI | 25 passed, including multi-supervisor identities, role labels, ratio and checked-in count. |
| Browser | Named-supervisor/ratio and mixed-trade planning flows passed (2/2) against the production bundle. |
| Build and lint | Production build passed; targeted ESLint passed. |
| Remaining boundary | No legal ratio presets are supplied. Operator policy review, hosted PostgreSQL parity, full-repository CI and independent field acceptance remain open. |

## Phase 189: Joint Portfolio Resource Planning

The schedule supports a shared Z3 resource proposal across two to eight
selected jobs (maximum 48 active tasks). It keeps selected task time/crew locks,
outside-job assignments, qualifications, availability, capacity, dependencies,
material holds and named supervision in scope. A shared worker can move between
selected sites only with sufficient directional travel time from verified,
current site/route evidence. Same-site zero travel requires matching retained
street addresses; unknown locations do not imply zero travel.

One source-hashed approval covers every selected job. The approval resolver
revalidates the whole source set and allocation inside its transaction, then
updates all task assignments and audit records atomically. A stale source leaves
the pending approval unapplied. The portfolio dashboard now exposes selection,
preview, crew/travel assumptions and approval submission, with a mobile-width
browser check.

Verification: the focused resource planner suite passed (19/19); the joint
portfolio browser flow passed (1/1), including approval submission and a 390px
viewport overflow check; production build and targeted ESLint passed. Vite
continues to warn that the main application JavaScript chunk exceeds 600 kB.
Hosted PostgreSQL parity, portfolio sizes beyond the bounded solver limits,
live route providers and external worker offers remain unverified. No commit,
push or deployment.

## Phase 190 - Begrensde stand-by opvolgoproepen

- Opt-in oproepbeleid uitgebreid tot maximaal drie verschillende geschikte
  uitvoerenden na elkaar; steeds staat hoogstens één oproep open.
- De duurzame planner verwerkt ook verlopen oproepen zonder dat de uitvoerende
  het portaal opent, met auditregistratie en een privacyveilige inboxmelding.
- Afgewezen/verlopen kandidaten worden overgeslagen; na drie pogingen of een
  andere status die beoordeling vraagt, gaat de verstoring terug naar de
  aannemer. Acceptatie en onafhankelijke vervangingsgoedkeuring blijven vereist.

## Phase 191 - Menselijk bevestigde afwezigheid na ontbrekende check-in

- De check-inwaarschuwing blijft niet gelijk aan een no-show. Owner of kantoor
  kan pas na eigen verificatie de verhindering voor exact die dienst vastleggen.
- De server controleert opnieuw de huidige bronhash, weigert verouderde invoer,
  schrijft geen medische/gezinsreden en laat de opdracht zelf ongemoeid.
- De verhindering voedt de bestaande conflict- en opt-in stand-byvervanging;
  idempotent herhalen dupliceert niet. Opzeggen kan alleen na nieuwe bevestiging
  van dezelfde actuele bron worden hersteld.
- Verificatie: domein- en API-tests, workbench-tests (8/8), gerichte ESLint,
  productiebuild en de geisoleerde browserflow waarschuwing-tot-bevestiging
  geslaagd. PostgreSQL-hosted parity en onafhankelijke veldacceptatie open.
- De geintegreerde ketentest bewijst ook de vervolgstap: na bevestiging maakt de
  volgende opt-in stand-bycyclus precies een privacyveilige oproep; plaatsing
  vereist nog steeds reactie van de uitvoerende en aparte goedkeuring.
- Gat gevonden en opgelost: de stand-byplanner eiste voor iedere oproep een
  deadline voor de start, waardoor herstel tijdens een al lopende dienst altijd
  naar kantoorreview ging. Alleen de bevestigde check-inuitval gebruikt nu een
  korte deadline binnen de dienst; nul-uurs aankondiging, 15 minuten minimale
  reactietijd, broncontrole en onafhankelijke goedkeuring blijven verplicht.

## Phase 192 - Dagstart van de vervangende uitvoerende

- De dagstart is nu gekoppeld aan de exacte medewerker, opdrachttoewijzing en
  diensttijden. Privé-diensttijden verdwijnen uit de gedeelde ploegweergave,
  maar blijven onderdeel van de integriteitscontrole.
- Werkmap, versleutelde offlineweergave en native Android tonen de briefing van
  alleen de eigen opdracht. Als een dagstart voor dezelfde dienst de vervanger
  mist, blokkeert startvrijgave totdat de actuele ploeg opnieuw is gebrieft.
- Ook zonder eerder vastgelegde dagstart blijft de vrijgave geblokkeerd; het
  kantoor moet eerst de dienstbriefing vastleggen. De huddle zelf is geen
  veiligheidsvergunning of toestemming om gevaarlijk werk te beginnen.
- Diensten over middernacht UTC zoeken dagstarts op de aangrenzende lokale
  werkdatums om tijdzoneverschuivingen in Nederland/EU niet te missen.
- De native bronweergave is bijgewerkt; mobiele APK/device-validatie blijft
  open. Ontbrekende dagstarts worden expliciet getoond.
- Focused domein-, API-, dagstart- en offline/native tests: 45 geslaagd.
- PostgreSQL-hosted parity en onafhankelijke veldacceptatie blijven open.

## Phase 193 - Taakoverdracht bij goedgekeurde vervanging

- Individuele en portfoliovervanging werken expliciete taakuitvoerders,
  ploegleden en toezichthouders in dezelfde ledgertransactie over.
- De goedkeuring controleert dienstdekking, taakrol en actuele kwalificaties.
  Een dubbele ploeg-/toezichthouderverwijzing wordt geweigerd. Een gedeeltelijk
  of buiten het dienstvenster gepland werkpakket laat de goedkeuring pending
  en wijzigt geen opdracht.
- Ongeplande taken gaan mee met een expliciet planningsherzieningssignaal;
  capaciteitsuren kunnen pas worden geboekt zodra een volledige planning bestaat.
  Capaciteitsreserveringen vanaf vandaag op de vrijgegeven opdracht worden
  auditbaar geannuleerd; eerdere registraties blijven ongewijzigd.
- Validatie: acht gerichte Node-suites geslaagd (132/132), waaronder werkbord,
  beschikbaarheid, herstel, ploegcapaciteit, planner en werkmap. Gerichte
  ESLint en productiebuild geslaagd; bestaande waarschuwing voor de 604,18 kB
  hoofdchunk blijft staan. `git diff --check` geslaagd. PostgreSQL-hosted parity
  en onafhankelijke veldacceptatie blijven open.

## Phase 194 - Planningsherziening na vervanging afronden

- Taken die bij een vervanging zonder volledig rooster meegaan, tonen nu een
  zichtbare waarschuwing in de kantoorwerkplanning met een directe ingang naar
  de resourceplanner.
- De herzieningsmarkering wordt pas opgelost wanneer een volledige planning
  aantoonbaar past binnen een actieve, goedgekeurde opdracht van de vervanger,
  met passende taakrol, kwalificaties en beschikbaarheid. Onvolledige of
  verouderde dekking blijft geblokkeerd.
- Na individuele en portfoliovervanging blijft niet langer onterecht
  `requiresApproval` actief op een inmiddels goedgekeurde vervangende opdracht;
  de afzonderlijke roosterbeoordeling blijft wel verplicht.
- Validatie: gerichte domein-, resourceplanner- en integratietests geslaagd
  (105/105); productie-browserflow geslaagd (1/1); gerichte ESLint geslaagd;
  productiebuild geslaagd met de bestaande waarschuwing voor de 604,18 kB
  hoofdchunk. PostgreSQL-hosted parity en onafhankelijke veldacceptatie blijven
  open.

## Phase 195 - Vaardigheden meenemen in acquisitiecapaciteit

- Per vakrol kan de aannemer maximaal twintig benodigde vaardigheidsnamen
  vastleggen. De invoer blijft bij bewerken behouden en wordt meegenomen in de
  brongebonden capaciteitsbeoordeling.
- De beoordeling vergelijkt genormaliseerde, exacte namen met de door
  uitvoerenden zelf opgegeven profielvaardigheden en toont per werkdag passende
  resterende uren en profielaantallen. Die signalen blijven gescheiden van de
  totale vakrolcapaciteit en goedgekeurde certificaten.
- Een ontbrekende profielvermelding maakt de beoordeling onvolledig; een
  overeenkomst wordt nooit als bewijs van vakbekwaamheid gebruikt en wijst
  niemand toe. Goedkeuring van vereiste certificaten, beschikbaarheid en
  onafhankelijke personeelskeuze blijven afzonderlijke controles.
- Validatie: acquisitie-/bidtests geslaagd (16/16), lokalisatietests (5/5),
  productie-browserflow (1/1), gerichte ESLint en productiebuild. De hoofdchunk
  is 604,89 kB en overschrijdt de ingestelde 600 kB-waarschuwingsgrens. Hosted
  PostgreSQL-pariteit en onafhankelijke operatoracceptatie blijven open.
- Volledige regressiecontrole: de eerste run had 1 fout op 955 tests in een
  bestaande gemengde-vakrol planner-test. De plannerfile slaagde geïsoleerd en
  ook in de tweede volledige run: 955 tests, 908 geslaagd, 47 PostgreSQL-tests
  overgeslagen, 0 fouten. De incidentele eerste fout is niet gereproduceerd;
  de testcode is niet aangepast om de uitkomst te maskeren.
- Open configuratiebevinding: de actieve lokale Vite-origin `127.0.0.1:34123`
  ontbreekt in de standaard API-originlijst. De API weigerde daarom een
  voorkeurmutatie met `403`; de originbeveiliging is niet versoepeld. Zie
  `docs/TECHNICAL_AUDIT.md`.

## Phase 196 - Toezichtbehoefte door acquisitie en werkplanning verbinden

- Een capaciteitsraming kan per vakrol een aparte supervisorrol, maximumploeg
  per supervisor, piekploeggrootte en supervisoruren per werkdag vastleggen.
  Benodigde supervisorhoofden en uren worden per dag afgeleid en getoetst tegen
  de eigen rolcapaciteit, beschikbaarheid, bestaande verplichtingen en expliciet
  opgegeven kwalificaties.
- Een supervisorrol mag niet dezelfde rol zijn als een productieve vakrol; zo
  wordt dezelfde geschatte persoon niet stilzwijgend dubbel geteld. De berekende
  verhouding is geen juridische of veiligheidskundige norm.
- Bij conversie gaat de genormaliseerde raming met bronhash mee als
  werkvoorbereidingsbasis. Supervisorcertificaten worden opdrachtvereisten. Het
  werkplan toont de geërfde schatting, maar maakt geen taken/toewijzingen aan en
  controleert geen overlappende supervisie over taakvensters.
- Validatie: gerichte Node-tests 18/18, frontend-/Nederlandse lokalisatietests
  7/7, browserketen van kans via conversie naar zichtbare werkplanbasis 1/1,
  `npm run lint` geslaagd. Productiebuild slaagt, maar de App-chunk is 610,12 kB
  tegenover de waarschuwingsgrens van 600 kB. De volledige Node-suite is
  geslaagd (910 geslaagd, 47 PostgreSQL-tests overgeslagen, 0 mislukt);
  hosted PostgreSQL-pariteit is niet beschikbaar/gevalideerd.

## Phase 197 - Voorcalculatie toetsen aan het resourceplan

- Een haalbaar resourceplan vergelijkt geraamde en geplande uren per vakrol,
  benoemt ontbrekende of extra vakrollen en vergelijkt benodigde toezichturen
  met de geconfigureerde toezichttaken. Het blijft een signaal: datums,
  geaccepteerde scope en wettelijke verhoudingen worden niet geverifieerd en
  het plan wordt niet automatisch aangepast. Wijzigingen in de raming maken
  een eerder voorstel verouderd via de bronhash.
- Interne coordinatiechecklists zijn expliciet uitgesloten van veldplanning;
  uitvoerende taken blijven een expliciete vakrol vereisen.
- Verholpen: bij goedkeuring van een gemengde-vakroltaak werd de hoofdtoegewezen
  uitvoerder soms foutief dubbel geteld als primaire vakrol. De expliciete rol
  van elk teamlid is nu leidend bij het oplossen van de vervangingsbeoordeling.
- Validatie: planner- en werkbordtests 62/62, de eerdere instabiele gemengde-
  vakroltest acht opeenvolgende runs, lokalisatie 6/6, productie-browserketen
  van kans via opdracht naar resourcepreview 1/1 en repository-ESLint geslaagd.
  De productiebuild slaagt met de bestaande 610,12 kB App-chunkwaarschuwing.
  PostgreSQL-hosted parity, vergelijking van datumvensters, verificatie van
  geaccepteerde scope en onafhankelijke operator-/veldacceptatie blijven open.

- Aanvullend definitief resultaat voor Phase 197: de volledige Node-run van
  27 september telde 958 tests: 911 geslaagd, 47 PostgreSQL-afhankelijke tests
  overgeslagen en geen fouten. Dit is geen volledige regressierun van Phase 198.

## 2026-09-30 - Phase 198 - Werkdatums en installatiepakketten

- Het resourcevoorstel vergelijkt nu geraamde en geplande roluren per lokale
  werkdatum, inclusief toezicht, werk buiten het geraamde venster en taken
  waarvan de datums onvolledig zijn. Ontbrekende dagramingen blijven onbekend,
  niet nul. Nachtwerk en zomer-/wintertijd worden op werkelijk verstreken uren
  verdeeld. De vastgelegde locatietijdzone is leidend; de Amsterdam-fallback
  wordt expliciet vermeld. Dit blijft een beoordeling, geen automatische
  scopewijziging, planninggoedkeuring of toestemming om te starten.
- Het dashboard toont een uitklapbare datumvergelijking, ook op telefoon.
  Oudere interne intakechecklists zonder de nieuwe uitsluitingsvlag blokkeren
  resourceplanning niet meer; veiligheids- en baselinetaken blijven behouden.
- Veertien ontbrekende bestanden toegevoegd aan Docker- en Windows-manifesten.
  De releasecontrole controleert nu de transitieve literal-import- en
  workerbestanden zonder broncode uit te voeren. Een extra Docker-fixture
  voert de echte solver uit en controleert een niet-mutatief planningsvoorstel.
- Alleen de kwetsbare indirecte ontwikkelafhankelijkheid brace-expansion
  bijgewerkt (5.0.9 naar 5.0.12); dependency audit meldt nul bekende problemen.
- Validatie: gerichte Node-tests 37/37, datum-/lokalisatiefrontendtests 8/8,
  aanvullende authenticatie-/autorisatietests 6/6,
  productie-browserketen 1/1 op 1440x1000 en 390x844, repositorylint en
  releasecontract geslaagd. De echte productiecontainer slaagt inclusief
  solver, sessie-/databaseherstart, identityherstel en overdrachtscontrole.
  Browsercontrole gebruikt repository-Playwright; er was geen afzonderlijke
  Browser-plugin beschikbaar. Productiebuild slaagt met de bestaande 610,13 kB
  App-chunkwaarschuwing. Screenshots staan in de tijdelijke map.
- Canonieke lokale API en gebouwde UI gestart op 127.0.0.1:3002 met Node
  22.23.2; shell en readiness geven HTTP 200. Poort 3001 hoort bij een andere
  applicatie. De losse Vite-start werd door uitvoerbeleid geweigerd; de
  gebouwde UI is direct op 3002 beschikbaar. Geen datareset, commit, push of
  deployment. Windows-binaryrebuild, volledige Phase-198-regressie,
  PostgreSQL-pariteit en onafhankelijke operator-/veldacceptatie blijven open.

- Aanvullende releaseblokkade voor Phase 198: de aparte bundelbudgetcontrole
  faalt. Grootste JS: 610125/600000 bytes; totaal gzip 674681/578500;
  Brotli 583409/540000. Ook vijf oppervlakbudgetten worden overschreden.
  Dit is meer dan een buildwaarschuwing; functionele tests en broncontract zijn
  groen, maar de releasegate niet. Limieten zijn niet verhoogd.

## 2026-09-30 - Phase 199 - Financiele werkruimte op aanvraag

- Financien is een eigen lazy werkruimte geworden. De canonieke requestfunctie
  wordt expliciet doorgegeven; acties, goedkeuringen, bedrijfsgebonden downloads
  en brononderbouwing blijven intact. De kasprognose blijft een aparte lazy
  control. Financiele actielabels hebben een gedeelde bron en laadgrenzen zijn
  hergebruikt zonder wijziging aan hun bestaande gedrag.
- De productie-browserflow bewijst nul FinanceWorkspace-JS-aanvragen op Vandaag
  en precies een na het openen van Financien. Grootste JS-bestand is nu 591140
  bytes tegenover 610125; de ongewijzigde grens van 600000 wordt gehaald.
- Verholpen: de productievertalingscompactor verwijderde de vertaling voor
  leesbaar gemaakte API-statuscodes, zoals cost_review_required. Bekende
  genormaliseerde statusliterals en objectkeys blijven nu in de catalogus.
  Een uitgevoerde gecompacteerde fixture en de echte Nederlandse kostenflow
  controleren dit. Bewaarde klant-/kostentekst is niet vertaald of herschreven.
- Browsertests kiezen hun taal expliciet om een opgeslagen voorkeur uit een
  eerder scenario niet als nieuwe standaard aan te nemen. Een verouderde
  reserve-oproepselector is bijgewerkt naar de huidige tekst; drie sequentiele
  aanbiedingen en afzonderlijke acceptatie/goedkeuring zijn extra gecontroleerd.
- Eerste volledige componentrun: 258/259 geslaagd, een oude tekstselector fout.
  Tijdens de daaropvolgende gelijktijdige Docker-build faalden 17/259 tests,
  grotendeels op de bestaande 5-secondenlimiet met daaruit voortvloeiende
  vervolgasserties. Vitest heeft nu maximaal twee workers. De herhaalde volle
  run is 259/259 groen (53 bestanden, 139 seconden), zonder ruimere termijnen
  of zwakkere assertions. Gerichte financiele/lokalisatietests zijn 8/8 groen.
- Overige validatie: 52/52 gerichte Node-/bron-/cachetests; vier productie-
  browserflows voor finance, dashboard/tablet/mobiel en acquisitie/planning;
  repositorylint, bronreleasecontract en echte Node-22-container groen.
  De container bewijst authenticatie, read-only/non-root runtime, sessie-/SQLite-
  herstart, identityherstel, overdracht en solverpreview. Financiele desktop- en
  telefoonscreenshots zijn bekeken in test-results. Playwright is gebruikt
  omdat de afzonderlijke Browser-plugin/skill niet beschikbaar is.
- De bundelgate blijft rood: totaal gzip 676627/578500 bytes; Brotli
  585512/540000 en vijf oppervlakbudgetten worden overschreden. Lazy laden is
  startuitstel, geen verkleining van alle inhoud; de totale compressieomvang
  is juist iets groter. Geen functie geschrapt en geen budget verhoogd.
- Canonieke lokale server op 127.0.0.1:3002 blijft ready en serveert de nieuwe
  build. Geen datareset, commit, push, provideractie of hosted deployment.
  Volledige Node-regressie, Windows-artifactrefresh, hosted databasepariteit,
  native telefoonvalidatie en onafhankelijke praktijkacceptatie blijven open.

## 2026-09-30 - Phase 200 - PostgreSQL-regressie en veilige testdoelen

- Alle veertien database-integratiebestanden en de Node-runner gebruiken nu
  dezelfde bescherming tegen een onbedoeld productiedoel: alleen loopback en
  expliciet contractor_ai_test-genaamde databases, zonder redirectparameters.
  Ook direct starten van een test is beschermd en foutmeldingen lekken geen
  URL of credential. CI gebruikt contractor_ai_test_ci met verify-full TLS.
- Een nieuw echt PostgreSQL-contract bewijst gemengde vakploegen, gedateerde
  capaciteitsvergelijking, alleen-lezenpreview, replay, terugdraaien van een
  verouderde goedkeuring, aparte beoordelaar, volledige ploeg na herstart en
  uitval zonder automatische vervanging. Een oud open voorstel moet eerst
  expliciet worden afgewezen; die bestaande veiligheidsregel is behouden.
- Volledige controle uitgevoerd met Node 22.23.2 en een eigen tijdelijke
  PostgreSQL 17.11-container, TLS met geverifieerd certificaat/hostnaam en
  loopbackpoort. Lokale groep: 896/896 in 224 bestanden, nul overgeslagen.
  Eerste databasegroep: 78/79, alleen een oude schema-092-verwachting fout.
  Alle vier concurrerende starts bereikten al correct schema 095. De test is
  bijgewerkt en controleert ook nieuwe tabellen, indexen en field_reply-CHECK.
  De hele databasegroep is daarna opnieuw uitgevoerd: 79/79 in 15 bestanden,
  nul overgeslagen (344,8 seconden). Eindbewijs is dus 975/975 in twee groepen,
  niet een verzwegen groene eerste volledige run. Gerichte bron-/release- en
  testveiligheidschecks: 20/20; lint en bronreleasecontract geslaagd.
- Migratie, herstel, bedrijfsoverdracht, onafhankelijke identiteit, auditketen,
  gelijktijdige claim-/limiterverwerking, werkcontext, deeloplevering en
  uitvoeringsgoedkeuringen zijn lokaal tegen PostgreSQL getoetst. Objectopslag
  blijft een test-double; dit bewijst geen live EU-provider of praktijkacceptatie.
- Alleen de eigen testcontainer is verwijderd; er zijn geen testprocessen meer.
  Opruimen van de tijdelijke TLS-fixturemap is door uitvoerbeleid geweigerd;
  die testbestanden kunnen in de tijdelijke map achterblijven. Geen bestaande
  administratie gewijzigd, geen commit, push, provideractie of deployment.
- Nieuwe doelstelling: productie klaar maken. Bundelbudgetten, nieuw Windows-
  artifact en live provider-/herstel-/operatoracceptatie blijven releasegates.

## 2026-09-30 - Phase 201 - Vertaalregressies en consistente browsertestruntime

- De productiecompactor behoudt expliciete, afwijkende terugvalteksten van
  aanroepers. Uitgevoerde gecompacteerde fixtures controleren beide talen,
  variabelen en de Engelse operatorinterface voordat de Nederlandse catalogus
  geladen is. De bestaande lazy taalroute blijft intact.
- Een proef met centrale Engelse catalogi is teruggedraaid: totaal gzip werd
  670014 bytes, maar de taalmodule groeide van ongeveer 58 naar 85 kB gzip.
  De eerdere proef toonde interne vertaalsleutels in het Engelse hoofdscherm.
  Deze ongewenste afweging is niet als productieverbetering behouden.
- Beide Playwright-testservers gebruiken nu de exacte Node-executable van de
  runner, niet een mogelijk afwijkende globale installatie. Een configuratietest
  bewaakt dit. Op deze machine was dat Node 22.23.2.
- Definitief bewijs: 9/9 gerichte Node-/vertaal-/cache-/configuratietests;
  repositorylint, bronreleasecontract en productiebuild geslaagd. De volledige
  componentgroep slaagde eerder in deze fase met 259/259. De drie definitieve
  productie-browserflows voor finance, ouderinterface en acquisitie/planning
  slagen in 23,3 seconden. Mobiele finance- en planningsscreenshots zijn bekeken.
- Twee eerdere browserpogingen bereikten een serveropstart-time-out. De
  herhaling slaagt met dezelfde 60-secondenlimiet; geen timeout is verhoogd.
  Een eerste cachetest kreeg 503 terwijl dist gelijktijdig opnieuw gebouwd werd;
  na de voltooide build slaagt de gehele gerichte groep. Dit bewijs is geen
  verklaring of oplossing voor alle mogelijke opstartvertragingen.
- Definitieve bundelgate blijft rood: App 591140/600000 bytes, totaal gzip
  676628/578500 en Brotli 585449/540000. Vijf oppervlakbudgetten blijven rood
  (field context, client delivery, recovery case, replacement plan, recovery
  actions). Geen budget verhoogd; centrale catalogusproef is niet meegeteld.
- De canonieke lokale API is herstart op 127.0.0.1:3002. Shell en readiness
  geven HTTP 200; configuratie, database en lokale evidenceopslag zijn ready.
  Dit is lokale readiness, geen hosted productieacceptatie. Geen datareset,
  commit, push, provideractie of deployment. Volledige eindregressie, bundel-
  verkleining, Windows-artifactrefresh en live operationele acceptatie blijven open.

## 2026-09-30 - Phase 202 - Behoudende Windows-releasekandidaat

- Builder en verifier delen CONTRACTOR_AI_WINDOWS_PACKAGE_DIR. Een kandidaat
  mag alleen een directe submap van de workspace-releasefolder zijn. Buitenpaden,
  geneste paden en junctions/symlinks (ook met ontbrekend doel) worden geweigerd.
  Hercontrole na de webbuild en controle op operatorgegevens voor de webbuild
  voorkomen dat een ongeschikt doel toch als gegenereerde output wordt behandeld.
- Nieuwe lokale kandidaat gebouwd onder
  release/ContractorAI-windows-x64-candidate-20260930-phase202. Het bestaande
  pakket en de draaiende lokale ontwikkeladministratie zijn niet vervangen.
  De kandidaat bevat Node 22.23.2, actuele productieassets en runtime-afhankelijkheden.
- SHA-256-vergelijking bevestigt dat alle 81 runtimebestanden en 94 JS-/CSS-
  assets gelijk zijn aan de huidige bron en build. BUILD.json registreert 124
  productiedependencies; metadata is geen distributiesignatuur.
- De echte verpakkingstest slaagt met schema 095_field_reply_notifications en
  nul open migraties. De eerste poging faalde alleen op een oude verwachting
  voor schema 093; de verifier controleert nu ook toepassing van 093, 094 en 095.
  Aanmelden, bedrijfsgrenzen, afgeschermd teamregister, identityherstart en
  backup/herstel, HAI-lezen/publicatie en ondertekende bedrijfsoverdracht slagen.
- Dezelfde echte solverfixture als de containertest wordt nu ook vanuit de
  kandidaat uitgevoerd. Deze bewijst de gebundelde worker/solver, gedateerde
  forecastvergelijking en een preview zonder ledgerwijziging. Het tunnelonderdeel
  blijft een gecontroleerde test-double; er is geen echte ngrok-ingang gepubliceerd.
- Gerichte Windows-/releasecontracttests: 20/20, nul overgeslagen. Gerichte
  ESLintcontrole geslaagd. De kandidaat is een lokaal getest uitgepakt pakket,
  geen gepubliceerde, gesigneerde of extern geaccepteerde distributie.
  Bundelbudgetten, volledige eindregressie en live productieacceptatie blijven open.

## 2026-09-30 - Phase 203 - Pakketbuild zonder live web-output te vervangen

- De Windows-builder bouwt naar een eigen tijdelijke release-submap. De Vite-
  compressieplugin gebruikt nu de werkelijk geconfigureerde outputdirectory,
  ook bij een absoluut pad, in plaats van altijd naar de gewone dist te schrijven.
  Kopieren naar het pakket gebeurt pas na een geslaagde webbuild. Stagingcleanup
  heeft pad-, junction- en privatedatabescherming; succes wordt pas daarna gemeld.
- De lifecyclehelper is getest bij succes en een gesimuleerde buildfout. In beide
  gevallen verdwijnen alleen eigen gegenereerde stagingbestanden; de oorspronkelijke
  buildfout blijft behouden. Brotli-tests decomprimeren werkelijk gebouwde fixtures
  en controleren dat actieve assets niet overschreven worden. Ze bewijzen geen
  foutvrije stroomuitval of een atomaire vervanging van een draaiend Windows-pakket.
- Echt pakket gebouwd naar
  release/ContractorAI-windows-x64-candidate-20260930-phase203 terwijl de
  canonieke lokale API bleef draaien. Alle 276 HTTP-controles van de shell en
  JavaScript-entry gaven ongewijzigde HTTP-200-inhoud. Alle 191 bestanden in de
  gewone dist behielden inhoud, omvang en wijzigingstijd. Alle 94 nieuwe JS-/CSS-
  assets hadden correcte Brotli-output; er bleven geen nieuwe stagingmappen achter.
  Rapport: TEMP/contractor-ai-phase203-build-isolation-report.json.
- De kandidaat doorstaat de echte Windows-smoke met Node 22.23.2 en schema 095:
  bedrijfsgrenzen, afgeschermde registers, identityherstart/backup/herstel, getekende
  overdracht, lokaal HAI-feedcontract en de echte read-only resource-solverpreview.
  De verifier noemt expliciet isolated_windows_package, liveProvidersVerified=false,
  de lokale HAI-fixture en de ngrok-test-double. Dit is geen live providerbewijs.
- Gerichte Node-/plugin-/pakket-/release-/cachetests: 29/29, nul overgeslagen.
  Repositorylint en bronreleasecontract slagen (101 canonieke paden, 12 retired,
  17 hosted sleutels, 728 bronbestanden). De laatste lifecyclewijziging is daarnaast
  gericht getest; de kopieer-/buildstappen van de echte kandidaat zijn ongewijzigd.
- Geen bestaande operatoradministratie of eerdere pakketten vervangen, geen
  commit/push/deployment. Bundelbudgetten, volledige eindregressie en echte
  EU-hosting-/provider-/operatoracceptatie blijven open. De reguliere devbuild
  bouwt nog steeds naar dist; de isolatie geldt voor de Windows-pakketbuilder.

## 2026-10-01 - Phase 204 - Volledige browseraudit en betrouwbare vervolgacties

- De browserrunner gebruikt voor automatische groepen exacte bestandsnamen en
  testtitels, niet meer verschuivende regelnummers. Een afzonderlijke reporter
  controleert geplande, gevonden en uitgevoerde scenario's exact eenmaal.
  Ontbrekende, dubbele, onverwachte, overgeslagen en onderbroken scenario's
  blokkeren de groep. De optionele auditmodus loopt door na een mislukte groep,
  behoudt afzonderlijke artefacten en eindigt nog steeds met een foutstatus.
- De eerste regelnummeraudit is geen volledige dekking: wijzigingen tijdens
  die ronde veroorzaakten vijf lege groepen en een gedeeltelijke selectie.
  De daaropvolgende stabiele ronde bewijst 38/38 groepen en 150/150 daadwerkelijk
  uitgevoerde scenario's, zonder dekkingsfouten: 147 geslaagd, drie mislukt.
  Die drie betreffen offline gesprekssnapshots, een overschreven weekkeuze en
  afronden met een verouderde casusversie. De volledige ronde was dus niet groen.
- Offline gesprekssnapshots krijgen pas een gereedmelding nadat de versleutelde
  opslag werkelijk voltooid is. Een opslagfout wordt zichtbaar zonder de online
  chat onbruikbaar te maken; late bevestigingen gelden niet voor een ander
  klantdossier. De browsertest wacht op positieve gereedheid, herlaadt offline,
  controleert de lokale foto en exact-replay-sleutel en synchroniseert daarna.
- Last Planner bewaart een handmatig gekozen week tijdens een vertraagde
  verversing en negeert een oud antwoord na een nieuwe invoer. Navigatie naar
  vorige/volgende week blijft gebaseerd op het weergegeven bord. Herstelcasussen
  maken oude leesverzoeken direct ongeldig bij verversing; vervolgcommando's
  wachten op actuele gegevens. Een mislukte lezing verwijdert oude acties,
  behoudt conceptbewijs en laat opnieuw lezen toe. Servercontroles op bron- en
  casusversies zijn niet versoepeld en er wordt niets automatisch opnieuw besloten.
- Een eerste gerichte ronde slaagde 18/18, maar de oorspronkelijke groepsvolgorde
  vond daarna nog een overlappende kostenwijziging: zeven van acht scenario's
  slaagden. Herstelonderdelen delen nu een schrijfvergrendeling; afronden blijft
  geblokkeerd tijdens een wijziging en de daaropvolgende verversing. Een oude
  succesmelding wordt verwijderd zodra een nieuwe wijziging begint. De volgende
  ronde slaagt 26/26 pogingen, verdeeld over zeven groepen en 22 unieke scenario's,
  inclusief beide oorspronkelijke mislukte groepen. Alle dekkingscontroles slagen.
- De brede componentcontrole vond daarna een fout bij heropenen na een onzekere
  foto-upload (266/267 geslaagd); een afzonderlijke controle reproduceert verlies
  van een concept wanneer navigatie voor passieve autosave-effecten plaatsvindt.
  De gedeelde concepthersteller registreert nu de actuele opslagafhandeling in
  de layoutfase. Een regressietest faalt vooraf en slaagt na de wijziging;
  de uploadtest controleert ook de bewaarde fotohash en uploadstatus. De uiteindelijke
  componentronde slaagt 268/268. Na de laatste rebuild slagen drie aanvullende
  browserscenario's voor deeloplevering, offline klantgesprek en conceptbehoud.
- Dossiernavigatie gebruikt een stabiele horizontale tabrij en een enkele
  scrollruimte. Twee te lichte tekstkleuren zijn donkerder gemaakt. Tests voor
  hoge mobiele secties richten zich op het begin van die sectie. Andere
  browserfixtures kiezen hun taal expliciet, vullen de vereiste vakgroep in,
  selecteren de bedoelde bewijsregistratie en gebruiken een unieke vervangingsrol.
- Verificatie: Node 22.23.2, 942 Node-tests geslaagd en 48 overgeslagen;
  deze overgeslagen aanvullende controles zijn geen actueel PostgreSQL-bewijs.
  Alle 268 componenttests in 54 bestanden slagen; runner-/cachetests 14/14 zonder
  skips. Repositorylint, webbuild en bronreleasecontract slagen: 101 canonieke
  paden, 12 retired, 17 hosted sleutels en 731 bronbestanden. Dependency-audit:
  nul bekende kwetsbaarheden, geen onafhankelijke beveiligingscertificering.
- De opnieuw gebouwde UI is afzonderlijk getest op de herstelde scenario's
  en aangrenzende werkstromen. Volledige eindregressie op een toekomstige
  releasekandidaat blijft vereist; eerdere groene onderdelen zijn geen enkelvoudige
  groene eindrun. Bewijsbestanden staan onder TEMP/contractor-ai-phase204-*.
- Het bundelbudget blijft rood: gzip 677051/578500 bytes en Brotli
  585777/540000 bytes. Ook fieldWorkContext, clientDelivery, operationalRecovery,
  operationalRecoveryCase, operationalReplacementPlan en operationalRecoveryActions
  overschrijden hun onveranderde deelbudgetten. Grootste JS blijft 591140/600000.
  Er is geen budget verhoogd, bestaande administratie gereset, commit/push,
  pakketpromotie, deployment of live provideractie uitgevoerd. De lokale API
  blijft op poort 3002 met schema 095; dit is geen EU-productieacceptatie.

## Phase 205 - actuele prognose-invoer en verplichte pakketcontrole (2026-10-01)

- Een volledige browseraudit op de bevroren Phase 204-build reproduceert dat
  een late verversing het ingevulde beginsaldo in de liquiditeitsprognose
  overschrijft. Vier nieuwe componentregressies falen voor de correctie.
  Gewijzigde datum en beginsaldo worden nu onafhankelijk behouden; verouderde
  lezingen en antwoorden na unmount publiceren geen prognose. Goedkeuring
  blijft geblokkeerd totdat de getoonde prognose bij de actuele invoer hoort.
  De vijf nieuwe regressies en twee bestaande financetests slagen samen 7/7.
- De bundelcontrole vereist alle begrensde productschermen en CSS, controleert
  dat opgeslagen Brotli-bestanden werkelijk overeenkomen met hun bron, en
  bewaart maten en SHA-256-hashes. Ook een afgewezen build kan een gestructureerd
  JSON-rapport schrijven. Ontbrekende, beschadigde en te sterk uitpakkende
  compressiebestanden worden geweigerd. Geen limiet is verhoogd.
- Windows-pakketten moeten deze controle doorstaan voordat een bestaand
  pakket wordt vervangen. Pakketverificatie herberekent het bewijs; oude
  pakketten zonder bewijs zijn geen actuele releasekandidaten. Een echte
  afgewezen pakketbouw laat de vorige doelmap, het standaard BUILD-manifest
  en alle 191 canonieke webbestanden met hashes en wijzigingstijden intact.
- Docker en CI gebruiken dezelfde grenscontrole; CI bewaart ook het rode
  rapport. De echte Docker-bouw stopt voordat de build begint doordat de
  gedeelde builder geen workers kan ophalen (transport HTTP 500). De daemon
  en andere projecten zijn niet gewijzigd; Docker-acceptatie blijft open.
- Een experimentele gezamenlijke Engelse tekstcatalogus vergrootte de
  downloads in plaats van ze te verkleinen en is volledig teruggedraaid.
  De bundeloverschrijdingen zijn dus niet opgelost of administratief omzeild.
- Volledige lokale Node-regressie: 999 tests, 951 geslaagd, 48 overgeslagen,
  nul fouten. Dit is geen nieuwe PostgreSQL-acceptatie. Alle 273 componenttests
  in 55 bestanden slagen. Lint en broncontract slagen (101 canonieke paden,
  12 retired, 17 hosted sleutels, 734 bronbestanden); dependency-audit meldt
  nul bekende kwetsbaarheden, geen onafhankelijke certificering.
- De brede browserronde voert alle 150 scenario's exact eenmaal uit in 38
  groepen: 149 geslaagd, een beginsaldofout op de bevroren Phase 204-build.
  Alle dekkingscontroles slagen. De eerste afzonderlijke hertest slaagt voor
  de oorspronkelijke vier scenario's, maar de aangrenzende financelokalisatie
  vindt te laag contrast bij een weekdatum. Secundaire tabeltekst is donkerder
  gemaakt; na de volgende rebuild slagen alle vijf scenario's met volledige
  dekking en zonder axe-uitsluitingen. De cashflowtest controleert ook hover
  en wacht op het verdwijnen van het mobiele menu voordat hij beeld vastlegt.
  Desktop 1440x1000 en mobiel 390x844 tonen beginsaldo 2500 zonder overlappende
  navigatie; titel, inhoud, foutoverlay, console en goedkeuring/archivering zijn
  gecontroleerd. Browser-plugin/skill niet beschikbaar; repository-Playwright
  gebruikt. Dit is geen enkelvoudige groene volledige eindregressie.
- De definitieve bundelcontrole faalt op gzip 677340/578500, Brotli
  586177/540000 en dezelfde zes deelbudgetten. Grootste JS 591140/600000 en
  CSS 246274/300000 voldoen; alle 94 gemeten assets hebben verifieerbaar
  Brotli-bewijs. Het rode JSON-rapport is bewaard. Lokale readiness op poort
  3002 meldt configuratie/database gereed en bewijsopslag geverifieerd.
- Geen administratie gereset, commit, push, pakketpromotie, deployment of
  live provideractie uitgevoerd. Bewijs staat onder TEMP/contractor-ai-phase205-*.

## Phase 206 - directe iconimports en echte Docker-afwijzing (2026-10-01)

- De vorige doelronde leverde aantoonbare voortgang: correcties in prognose-
  invoer en contrast, verplichte pakketcontrole en nieuwe regressiebewijzen.
  Productiegereedheid blijft het volledige doel; geen gate is vervallen.
- Een aparte classic-JSX-proef verlaagt gzip slechts naar 673684 bytes en
  vergroot het grootste bestand tot 601517 bytes, boven de bestaande grens.
  Deze proef is niet overgenomen. De canonieke app bleef tijdens de proef intact.
- Vite herschrijft nu benoemde Lucide-imports naar de werkelijk geexporteerde
  iconbestanden. De mapping wordt gestructureerd gelezen uit de geinstalleerde
  dependency, inclusief aliassen; geen zelfbedachte naam-naar-bestandsconversie.
  Namespace-, default-, niet-icon- en rechtstreekse imports blijven behouden.
  Dependencies, andere bestandssoorten en TypeScript worden niet herschreven.
- De identieke private bouwvergelijking verwerkt 1740 versus 252 modules.
  Een enkele meting is 17,67 versus 14,85 seconden; dit is geen algemene
  prestatiegarantie. Gewone builds slagen in 15,42 en 18,75 seconden; andere
  lokale belasting en cachetoestand maken die tijden niet onderling gelijkwaardig.
  Gzip stijgt marginaal naar 677516/578500; Brotli daalt naar 586030/540000.
  Grootste JS 591427/600000 voldoet, maar de zes deelbudgetten blijven rood.
  Dit is een bouwoptimalisatie, geen oplossing voor de downloadoverschrijding.
- Zes nieuwe importtests, vijf catalogustests en negen bundeltests slagen 20/20.
  Nog 29 release-/Windows-/offline-shell-/static-performance-tests slagen zonder
  skips. Alle 273 componenttests in 55 bestanden slagen opnieuw. Repositorylint
  en broncontract slagen: 101 canonieke paden, 12 retired, 17 hosted sleutels,
  737 bronbestanden. De volledige Node-run van Phase 205 is historisch bewijs;
  deze fase voert geen nieuwe volledige Node- of PostgreSQL-ronde uit.
- De eerste browserronde slaagt 7/8: de nieuwe icoontest controleert het menu
  voordat de gebruikersrechten zijn geladen. De test wacht nu op de ingeschakelde
  Finance-knop en de volledige navigatie; geen productcontrole is versoepeld.
  De oorspronkelijke vier-case groep slaagt daarna 4/4 met geldige dekking.
  Acht unieke scenario's zijn uiteindelijk groen, inclusief twaalf hoofdschermen,
  dialogen, mobiele navigatie, klantportaal, offline chat/foto, registratie,
  scoped uitvoerdertaak en financiele goedkeuring/archivering. Dit is geen
  volledige groene run van alle inmiddels 151 browserscenario's.
- Een laatste icooncontrole slaagt 1/1 en wacht ook op de echte dagwerkbank
  voordat screenshots worden genomen. SVG-vormen en afmetingen, betekenisvolle
  inhoud, paginatitel, ontbrekende foutoverlay, console, menu-acties en mobiele
  breedte zijn gecontroleerd op 1440x1000 en 390x844. Browser-plugin/skill is
  niet beschikbaar; bestaande repository-Playwright is gebruikt.
- Docker 29.6.2 kan nu weer bouwen. De echte Alpine-bouw verwerkt 252 modules,
  bouwt de UI en wordt vervolgens geweigerd door de onveranderde bundelgrenzen.
  Dit is aantoonbare uitvoering van de gate, geen geaccepteerde runtime-image.
  Een nieuwe echte Windows-afwijzing bewaart de vorige doelmap, het standaard
  BUILD-manifest en alle 191 geserveerde bestanden met hashes en tijden.
- Lokale HTTP-pagina en readiness op poort 3002 slagen. Geen bestaande diensten
  gestopt, administratie gereset, commit/push, pakketpromotie, deployment of
  provideractie uitgevoerd. Bewijs: TEMP/contractor-ai-phase206-*.
- De laatste importgrens beperkt omzetting expliciet tot `./icons/`-exports;
  ook standaard-geexporteerde helpers zoals createLucideIcon blijven op de
  publieke API. De 20 import-/catalogus-/bundeltests slagen opnieuw. Na de
  laatste rebuild zijn het volledige rapport en de hashes van alle 94 gemeten
  assets en hun Brotli-bestanden exact gelijk aan de geteste kandidaat.

## Phase 207 - herstel van onderbroken vervangingsplannen (2026-10-01)

- Een inventarisatie vindt 589 eenvoudige label/veld-combinaties in de twee
  grootste schermmodules. Een gestructureerde Babel-proef zet daarvan 587
  combinaties uitsluitend in een private build om; twee geneste labels blijven
  intact. Het grootste JS-bestand daalt naar 582105 bytes, maar gzip wint slechts
  109 bytes en Brotli verliest 80 bytes tegenover Phase 206. De proef is niet
  overgenomen: helper, codemod, bijbehorende tests en tijdelijke directe
  dependency zijn verwijderd. App.jsx en JobWorkspaceControls.jsx zijn niet
  door deze proef herschreven; bestaande wijzigingen blijven intact.
- Het herstelplan kon zijn redenveld tijdens opslaan blijven wijzigen en na
  een verloren antwoord een nieuw samengesteld verzoek indienen. Het bewaart
  nu het exacte onzekere verzoek in de bestaande operator- en brongebonden
  sessiedraft. Alle invoer en nieuwe indiening blijven geblokkeerd tot identieke
  herhaling of een definitieve afwijzing. Een synchronische vergrendeling voorkomt
  gelijktijdige verzoeken. Een afwijzing geeft de invoer vrij zonder de gekozen
  vervanger te verliezen. Er is geen nieuw backendcontract of migratie nodig.
- Afgesloten, geannuleerde en verouderde herstelcasussen blokkeren nu ook
  onderliggende vervangings-, klantdatum- en kostenacties. Alleen-lezen historie
  blijft beschikbaar. Onafhankelijke goedkeuring blijft vereist; er is geen
  automatische roosterwijziging, bestelling, betaling of extern bericht.
- Zeven nieuwe componentregressies en de bestaande herstelcontroles slagen
  gericht 24/24. De volledige componentronde slaagt 280/280 in 56 bestanden.
  Negen gerichte Node/API-tests slagen zonder skips; de vervangings-API bewijst
  bij herhaling dezelfde plan- en approval-ID voordat onafhankelijke goedkeuring
  de bestaande opdrachten samen mag vervangen.
- Alle negen geselecteerde browseridentiteiten worden precies eenmaal uitgevoerd
  en slagen met geldige dekking. Dit omvat offline taakhervatting, vervanging over
  opdrachten, leveranciersopvolging, klantafspraken, gecombineerde casusafsluiting
  en beschikbaarheid met onbekende terugkeer. Een aanvullende visuele controle
  slaagt 1/1 en verliest opzettelijk het antwoord nadat de echte server het plan
  heeft opgeslagen. De identieke herhaling laat precies een goedkeuringsverzoek
  bestaan en wijzigt de oorspronkelijke bezetting niet. Reload toont hetzelfde
  opgeslagen verzoek. De verwachte netwerkfout is apart gecontroleerd; overige
  console- en paginafouten ontbreken. Axe op de herstelweergave slaagt zonder
  uitsluitingen. Desktop 1440x1000 en mobiel 390x844 tonen de geblokkeerde velden,
  herhaalknop en bevestiging zonder horizontale pagina-overloop. Browser-plugin/
  skill ontbreekt; repository-Playwright met geisoleerde runtimes is gebruikt.
- Build slaagt in 15,69 seconden met 252 modules; bundelgrenzen blijven rood:
  gzip 677669/578500, Brotli 586174/540000 en zes deelbudgetten. De functionele
  correctie voegt 153 gzip- en 144 Brotli-bytes toe; geen downloadwinst geclaimd.
  Lint, diffcheck, broncontract (101/12/17/739) en dependency-audit slagen;
  audit meldt nul bekende kwetsbaarheden, geen beveiligingscertificering.
  Readiness op poort 3002 blijft gereed met geverifieerde bewijsopslag.
- Geen commit/push, operatoradministratie gereset, pakketpromotie, geaccepteerde
  containerbouw, deployment of provideractie uitgevoerd. Een volledige groene
  eindrun van alle 152 browsercases en externe productieacceptatie blijven open.
  Bewijs staat onder TEMP/contractor-ai-phase207-* en
  contractor-replacement-recovery-*.
- De laatste strengere browserhertest slaagt 1/1: precies een mislukte request
  naar de opzettelijk afgebroken vervangings-URL en precies een bijbehorende
  consolefout zijn toegestaan, ook na reload. Andere netwerk-, console- en
  paginafouten worden niet verborgen. De screenshotgalerij is opnieuw bekeken.
- De volledige laatste Node 22.23.2-ronde slaagt: 1005 tests, 957 geslaagd,
  48 omgevingsskips, nul mislukt/geannuleerd, 647,70 seconden. Dit is nieuw lokaal
  backendbewijs, geen nieuwe PostgreSQL- of live-provideracceptatie. Alle voor
  deze fase gestarte test-, lint-, audit- en buildprocessen zijn voltooid.

## Phase 208 - begrensde offline documenten en laden op aanvraag (2026-10-01)

- De drie vrijwel identieke PDF-downloadlussen voor tekeningen, SDS en
  submittals zijn samengevoegd. Een bytebuffer met de goedgekeurde omvang
  vervangt bewaarde streamchunks plus een tweede buffer. MIME/signatuur,
  checksum, omvang, brongebonden routes, redirectweigering, timeout en bestaande
  documentlimieten blijven intact. Een ontbrekende body wordt expliciet
  geweigerd; ook bij lees- of annuleringsfouten wordt de streamlock vrijgegeven.
- De private refactor-only build wint slechts 38 gzip-bytes en verliest 32
  Brotli-bytes. Geen wezenlijke downloadwinst geclaimd. De online werkmap laadt
  PDF-verificatie en kluisversleuteling nu pas op aanvraag. De browser bewijst
  dat openen van een pakket geen van beide modules opvraagt; een losse download
  laadt alleen de PDF-module. De offline shell blijft alle benodigde modules
  installeren. Alle 96 gegenereerde JS/CSS-assets blijven in de totale budgetten.
- Opslaan van een offline map heeft nu een synchronische vergrendeling tegen
  dubbele indiening. De wachtzin blijft tijdens opslaan geblokkeerd. Een
  mislukte download of gewijzigde live bron bewaart geen kluis; de wachtzin
  blijft beschikbaar voor een bewuste nieuwe poging. Vier ontbrekende
  Nederlandse labels voor technische PDF-downloads zijn toegevoegd.
- Negentien nieuwe Node-regressies dekken de drie documentsoorten met
  progressieve streams, gecodeerde routes, ongeldige metadata, HTTP/MIME/body,
  overflow, truncatie, checksum, niet-PDF met passende hash, falende read/cancel
  en gezamenlijke aantallen/omvang. De gerichte Node-groep slaagt 43/43 zonder
  skips. Dit is geen nieuwe volledige Node/PostgreSQL/provider-run.
- Zes nieuwe opslagcomponenttests en een vertaalregressie zijn toegevoegd.
  De eerste testrun vond onjuiste testhelpers; deze zijn gecorrigeerd naar de
  bestaande testbibliotheek. De laatste volledige componentronde slaagt
  287/287 in 57 bestanden, 110,22 seconden.
- De uitgebreide browsercase maakt drie echte, goedgekeurde PDF-bronnen aan,
  controleert online SDS/submittal-downloads, heropent de versleutelde map
  offline en vergelijkt alle downloadbytes. Een bewaarde vraag synchroniseert
  precies eenmaal; verlopen toegang verwijdert documentlinks. De laatste
  twaalf geselecteerde browseridentiteiten slagen precies eenmaal in drie
  groepen met geldige dekking, inclusief bedrijfsafscherming, klantfoto's en
  antwoorden, gecontroleerde documenten en operationeel herstel.
- Desktop 1440x1000 en mobiel 390x844 zijn bekeken, inclusief eerste viewport,
  identiteit, betekenisvolle inhoud, geen framework-overlay, relevante
  console/paginafouten of horizontale overloop, en echte interacties. Axe op
  de offline pagina slaagt zonder uitsluitingen. Browser-plugin/skill ontbreekt;
  repository-Playwright gebruikt geisoleerde runtimes, geen operatorgegevens.
- Build slaagt met 252 modules in 15,51 seconden. Lint, diffcheck en broncontract
  slagen (101/12/17/740). Totale omvang groeit tegenover Phase 207 met 1081
  gzip- en 1149 Brotli-bytes: 678750/578500 en 587323/540000. Vijf deelbudgetten
  blijven rood; laden op aanvraag is geen opheffing van de releaseblokkade.
  Het volledige rapport met alle bron/Brotli-hashes blijft na browserchecks
  exact gelijk: a0d9e674c3e04188355b0f7b924861a346b95f11565e910e142d77a49560872d.
- Readiness op poort 3002 meldt local/sqlite gereed en bewijsopslag geverifieerd.
  Geen operatorreset, commit/push, pakketpromotie, geaccepteerde container,
  deployment of provideractie uitgevoerd. De volledige groene eindrun van
  152 browsercases en productieacceptatie blijven open. Bewijs:
  TEMP/contractor-ai-phase208-*. Alle voor deze fase gestarte processen zijn
  voltooid; de bestaande lokale app blijft beschikbaar.

## Phase 209 - brongebonden en afgeschermde browsercontrole (2026-10-01)

- De standaard browserrunner legt na een enkele build alle 195 geleverde
  bestanden vast, inclusief HTML, service worker en compressiebestanden.
  De vastlegging bevat ook 83 runtimebestanden uit beide pakketmanifesten en
  hun afhankelijkheden, 179 applicatiebronnen en 93 browser/testbronnen.
  Voor en na elke groep worden inhoud en bestandsinventaris opnieuw gecontroleerd.
  Toevoegingen, verwijderingen, links of gewijzigde bronnen stoppen de controle,
  ook als gewone scenariofouten mogen worden verzameld. Lege groepen worden
  geweigerd. Resultaten staan standaard buiten de repository in TEMP.
- Een echte eerste poging is terecht gestopt nadat de runner tijdens de ronde
  werd aangescherpt: na acht scenario's werden de gewijzigde bronbestanden
  herkend. Die afgebroken ronde telt niet als volledige acceptatie.
- De volgende ongewijzigde kandidaat voert alle 152 scenario's precies eenmaal
  uit: 151 slagen, de iconentest faalt door een overgenomen Nederlandse voorkeur.
  De minimale hulpcentrum-plus-iconentest reproduceert de fout. De iconentest
  wacht nu op geladen gebruikersinstellingen en selecteert expliciet Engels;
  alle bestaande icoon-, navigatie-, fout- en toegankelijkheidschecks blijven.
  Drie herhalingen plus de uitgebreidere vijf-casegroep slagen: 11 controles.
- Playwright en zijn servers erven nu alleen expliciet toegestane platform-,
  browsercache-, CI-weergave- en screenshotinstellingen. Lokale SQLite/opslag en
  loopback worden afgedwongen; scheduler, AI, WhatsApp en live weer staan uit.
  Echte database/opslag/identiteitsinstellingen, private paden, providerkeys,
  proxies en Node-preloads worden niet doorgegeven. Dit is geen netwerksandbox.
  De 34 gerichte runner/kandidaattests slagen zonder skips.
- Een volgende brede ronde met fictieve hosted/S3/database/identity- en
  ingeschakelde kanaalinstellingen in de parent stopt terecht na 40 geslaagde
  scenario's: een bewerkt document staat ook in beide pakketmanifesten.
  De aanname dat alle documentatie buiten de kandidaat valt was onjuist.
  Documentatie en een extra regressie onderscheiden nu verpakte documenten
  van losse notities. Deze afgebroken ronde telt niet als volledige acceptatie.
  Alle verpakte documenten worden afgerond voor de uiteindelijke brede ronde.
  De productiegrenzen blijven ongewijzigd.
- De laatste brede ronde gebruikt tien groepen van maximaal zestien cases.
  Alle 152 identiteiten worden precies eenmaal uitgevoerd met geldige dekking;
  151 slagen en een test faalt doordat zij een ontbrekende aanmelding op de
  eerste pagina verwacht. De trace toont de bewaarde melding in het dashboard,
  maar niet tussen de eerste twintig van 156 acties. De test zoekt nu via het
  bestaande zoekveld op de medewerker en behoudt de menselijke bevestiging.
  De volledige betrokken zestien-casegroep slaagt met dezelfde build-, runtime-
  en applicatiebytes. Testbronnen verschillen; dit is geen volledige groene
  eindronde. Het eerdere taalprobleem is ook in deze brede ronde verholpen.
- De laatste gerichte Node-groep slaagt 42/42 zonder skips in 9,63 seconden:
  36 runner/kandidaattests en zes dagelijkse-cyclustests. De extra regressie
  gebruikt 24 andere opdrachten en meer dan twintig acties; de begrensde monitor
  behoudt de aanmeldingscontrole en zoeken vindt deze zonder afwezigheid aan te
  nemen. Volledige Node-, PostgreSQL- en componentruns zijn niet opnieuw gedaan.
- Build slaagt met 252 modules in 20,96 seconden. Volledige lint en laatste
  gerichte lint, diffcheck en broncontract slagen (101/12/17/742). Het complete
  budgetrapport en alle 96 JS/CSS/Brotli-identiteiten blijven gelijk aan Phase 208.
  Gzip 678750/578500, Brotli 587323/540000 en vijf deelbudgetten blijven rood.
  Geen grenzen verhoogd, onderdelen uit telling gehaald of nieuwe release geclaimd.
- De server op poort 3002 bleek gestopt. Voor herstart van de bestaande lokale
  ontwikkelomgeving is een consistente SQLite-snapshot gemaakt in de genegeerde
  map data/release-backups; SQLite integrity_check meldt ok. Dit is geen volledige,
  versleutelde of ondertekende database-plus-bijlagenhersteltest. De lokale shell
  en readiness geven weer HTTP 200, met local/sqlite, geverifieerde bewijsopslag,
  geldige ledger, schema 095 en nul open migraties. Er zijn geen gegevens gereset.
- Desktop/mobiele screenshots uit de brede ronde zijn bekeken; betekenisvolle
  inhoud, echte interacties, framework-/foutcontroles, containment en geselecteerde
  axe-checks blijven gedekt. Repository-Playwright gebruikt tijdelijke administraties;
  Browser-plugin/skill ontbreekt. Geen provider-, pakket-, container- of deployment-
  acceptatie, commit of push. Bewijs staat onder TEMP/contractor-ai-phase209-*,
  contractor-ai-browser-results-B3l6cp en contractor-ai-phase209-busy-monitor-final.
- CI bewaart voortaan de resultaten uit de runner-tempmap via een always-run
  artifactstap. De lokale broncontracttest controleert die koppeling; er is geen
  echte GitHub Actions-run of artifactpublicatie gestart. Alle voor deze fase
  benodigde korte controles en browserprocessen zijn voltooid. Alleen de lokale
  ontwikkelserver blijft bewust draaien. De volledige groene eindrun na de
  laatste testcorrectie, bundelverkleining en productieacceptatie blijven open.

### 2026-10-01 - Phase 210: veilige hervatting van herstelacties

- Bundelprofiel opnieuw gemeten. Exact dubbele CSS-regels bedragen slechts
  187 bytes in App.css en 72 in JobWorkspaceControls.css; geen onveilige
  cascadeverwijdering of cosmetische budgetomleiding uitgevoerd.
- Vier nieuwe rode componenttests reproduceren een verdwenen leveranciersformulier,
  ontbrekende identieke herhaling van kostentoerekening/correctie en een
  magazijnherhaalactie zonder actuele wijzigingsrechten. Zes herstelvormen
  delen nu een synchrone schrijfblokkade en behoud van onzekere verzoeken.
  Definitieve weigeringen laten correctie toe; antwoordverlies behoudt de
  oorspronkelijke actie. Een fout in de succesweergave wordt niet meer als
  mislukte ledgeropslag geclassificeerd. Leveranciersformulieren blijven
  gemonteerd tijdens de tijdelijke bovenliggende blokkade en bij inklappen.
- De brede browserpoging geeft in de eerste complete groep 15/16; het
  liquiditeitsspoor toont een nul-herberekening nadat 2500 werd ingevuld terwijl
  de eerste prognose nog niet geladen was. Die poging is bewust onderbroken;
  alleen de geverifieerde eigen testprocesboom is gestopt. De gewone lokale
  server en operatorgegevens zijn niet gestopt of gereset. Een aanvullende rode
  test bevestigt de bewerkbare standaardinvoer en NaN-totalen. De weergave wacht
  nu op werkelijke prognosegegevens. De oorspronkelijke geldwaarde-asserties
  blijven behouden en slagen na reparatie.
- De laatste volledige componentronde slaagt 306/306 in 59 bestanden, 166,99
  seconden. Dit zijn negentien extra regressies ten opzichte van Phase 208.
  De laatste Node-selectie slaagt 56/56 zonder skips in 7,18 seconden.
  Laatste volledige lint, diffcheck en broncontract slagen (101/12/17/745).
- De twee eerste gerichte browsergevallen slagen, gevolgd door de definitieve
  tien-casegroep met exacte coverage: liquiditeitsgoedkeuring/archief,
  contractdatums, offline instructie/hervatting, vervanging, leveranciersopvolging,
  klantafspraak, gecombineerde sluiting en kostentoerekening. Een echte opslag
  in de tijdelijke testledger gevolgd door bewust antwoordverlies, herladen en
  identiek herhalen levert replayed=true en precies een kostentoerekening op.
  Alle tien slagen in 2,5 minuten. Dit is geen volledige groene 152-case-eindronde.
  Kandidaat d19969acc4595b8214389357c3d9dd8108113b13f0ddd23863991591574843ea
  blijft ongewijzigd voor en na de groep. Bewijs staat buiten de repo onder
  TEMP/contractor-ai-phase210-recovery-final-Hm6Bav en contractor-ai-phase210-*.
- Build slaagt met 253 modules in 21,64 seconden. Het gemeten volledige
  97-assetrapport blijft rood: gzip 678767/578500, Brotli 587337/540000 en vijf
  deelbudgetten. Vergeleken met Phase 209 zijn de totalen 17 en 14 bytes groter;
  geen bundelverkleining geclaimd. Een aparte build in TEMP is eerst gemeten,
  voordat de browserrunner de canonieke uitvoer bouwde. De grenzen zijn gelijk.
- Desktop 1440x1000 en mobiel 390x844 zijn visueel bekeken; paginatitel,
  betekenisvolle inhoud, geen frameworkoverlay, paginaproblemen of onverwachte
  consolefouten, containment en geselecteerde axe-regels zijn gecontroleerd.
  ERR_CONNECTION_RESET hoort uitsluitend bij het bewust verloren testantwoord.
  Repository-Playwright gebruikt tijdelijke administraties omdat de Browser-
  plugin/skill ontbreekt. Nieuwe volledige Node/PostgreSQL-, pakket-, container-
  en provideracceptatie zijn niet uitgevoerd. Geen commit, push of deployment.
  Readiness op 3002 meldt HTTP 200, local/sqlite, alleen loopback en geverifieerde
  bewijsopslag. Productieacceptatie en de volledige groene eindronde blijven open.

### 2026-10-01 - Phase 211: React-equivalentie en duidelijke veiligheidsstatus

- React- en browser-testvaardigheden gelezen; de repository-Playwright-runner
  gebruikt omdat de Browser-plugin/skill ontbreekt. Dit betekent niet dat alle
  browserbesturing ontbreekt. Geen ongerelateerde diensten of providers benaderd.
- Directe classic-JSX-vergelijking overschrijdt het hoofdbundelbudget. Een
  gecachte classic-variant spaart meer overdracht, maar de nieuwe equivalentietest
  vindt een echt verschil in function defaultProps onder React 19. Die variant
  wordt niet overgenomen. De uiteindelijke virtuele buildmodule exporteert de
  werkelijke jsx/jsxs/Fragment-functies en de createElement-fallback van de
  geinstalleerde React-runtime. Ontwikkeling blijft standaard automatic JSX.
  Exacte module-ID-resolutie, props, keys, fragmenten, events/refs, markup,
  defaultProps en naamconflicten zijn getest; geen vervangende React-implementatie.
- De complete browserpoging voert alle 152 identiteiten precies eenmaal uit in
  tien groepen. Kandidaat d8513b2cad39696dea24d0bc901a388adf7feec58aef1b489cc9ff26cca5094d
  blijft gelijk. Coverage is geldig, maar de uitslag is 151 geslaagd en een fout.
  De LMRA-stopwerk-POST geeft 201 na 10345,735 ms, voorbij de ongewijzigde
  10000-ms-assertie. Antwoord en schermafbeelding bevestigen de tweede beoordeling:
  stop_work, readyForHazardousWork=false, stopWorkImmediate=true. Een afzonderlijke
  herhaling slaagt op dezelfde kandidaat; geen latencyreparatie of groene
  volledige eindronde geclaimd. Bewijs: TEMP/contractor-ai-browser-results-2AewT8
  en contractor-ai-phase211-lmra-recheck-oCpJgo.
- Visuele controle vindt een verlopen-caption bij een actuele werkstop.
  Zes rode regressies en twee bestaande geldigheidsvarianten begeleiden het
  onderscheid tussen herbeoordeling, verlopen geldigheid en vervangen historie.
  Een aanvullende badgecheck geeft twee rode Nederlandse gevallen. De vertaling
  wordt aangevuld zonder canonieke outcome-waarden of veiligheidsregels te
  wijzigen. De acht regressies slagen daarna. Een echte axe-browsercontrole
  vindt daarnaast color-contrast-fouten in de veiligheidsregels; alleen de
  regeltekst wordt donkerder. Geen regel, timeout of bedrijfsassertie versoepeld.
- De eerste overlappende component-/browserronde geeft een leverancierstimeout
  (305/306), gevolgd door een geslaagde single-worker-ronde (306/306). Een
  latere componentherhaling geeft een positie-verversingsfout (313/314); de
  gezamenlijke gerichte veiligheids-/afroepronde slaagt 20/20. De laatste normale
  volledige componentronde na alle vertaal- en contrastwijzigingen slaagt
  314/314 in 60 bestanden, 140,39 seconden. Timingmarge blijft een restrisico,
  niet een bewezen productieprestatieverbetering. Laatste Node-selectie 68/68
  zonder skips; de JSX-suite ook 12/12 met NODE_ENV=production. Volledige lint
  en broncontract slagen (101/12/17/748).
- De definitieve eerste 16 browsergevallen slagen precies eenmaal in 2,5 minuten
  op kandidaat 18cd4a74fbfdd0fb5d58893032e4f46cfe310672be9cfb396884084871c0d5d3.
  Dit herhaalt de oorspronkelijke foutcontext en controleert nu ook de
  Nederlands/Engelse veiligheidslabels, werkstopbadge, vervangen beoordeling,
  mobiele containment, paginaproblemen en geselecteerde WCAG-regels. De bron
  blijft gelijk voor en na de groep. Bewijs:
  TEMP/contractor-ai-phase211-accepted-safety-WlXs5z. De eerdere contrastselectie
  slaagt 16/16 op e6620e9c51b451e795b690402427b4b5c2de26b27e6c1826e8054550a533a002,
  maar is na de badgevertaling niet de definitieve bron. De actuele mobiele
  NL/EN- en desktop-NL-regelbeelden zijn bekeken; geen clipping of overlap.
- Laatste build slaagt met 254 modules in 19,34 seconden; geen algemene
  snelheidsgarantie. Hoofd-JavaScript daalt 591432 naar 573176 bytes. De totale
  besparing is slechts 2006 gzip- en 1199 Brotli-bytes: 676761/578500 en
  586138/540000. Alle 97 assets blijven meetellen; vijf deelbudgetten blijven
  rood. Geen asset weggelaten, deelbundel hernoemd of grens verhoogd.
- Geen operatorreset, commit/push, pakketpromotie, deployment of live-provider-
  activering. Nieuwe volledige Node/PostgreSQL-, pakket- en containeracceptatie
  zijn niet uitgevoerd. Volledige groene einddekking op de definitieve bron,
  grotere bundelverkleining en externe productieacceptatie blijven open.
- Na de rapportagewijzigingen blijven kandidaathash en volledig bundelrapport
  exact gelijk; diffcheck slaagt. HTTP 200 en titel Contractor.AI op 3002;
  lokale readiness is ready, SQLite, alleen loopback en geverifieerde private
  bewijsopslag. Alle eigen verificatieprocessen zijn voltooid. De bestaande
  lokale applicatie blijft draaien; dit is geen productie-readiness.

### 2026-10-02 - Phase 224: gedeelde, begrensde conceptopslag

- Operator-, klant- en veldformulieren delen een opslagcoordinator: een timer,
  een pagehide-handler en een opslaginventaris per flush. Iedere invoer behoudt
  zijn eigen debounce. Opgeslagen waarden worden uit de coordinator vrijgegeven;
  bewust wissen annuleert ook wachtende taken. Geheimen/bestanden, de bestaande
  128 KiB/1 MiB-limieten en 12-uursvervaltermijn blijven behouden. Tijdelijke
  opslagfouten veroorzaken geen herhaallus; pagehide probeert opnieuw.
- Dertien nieuwe regressies omvatten 32 gelijktijdige formulieren, onafhankelijke
  deadlines, scopewisseling, expliciet wissen, privacy, quota en opslagfouten.
  Volledige frontend: 441/441 in 74 bestanden. Laatste gerichte Node-selectie:
  94/94 zonder skips. Volledige lint en aanvullende lint na testcorrecties slagen.
- Eerste browserronde: 28/30. Een bronplaats-test voor klantautorisatie is
  bijgewerkt naar de daadwerkelijk gebruikte gedeelde aanvraagfunctie. De
  browsertests kiezen nu expliciet de taal van de kantooroperator en onderscheiden
  uitsluitend een geannuleerde GET /api/ledger/command-plan van antwoordverlies.
  Geen veiligheids-, opslag-, idempotentie- of tijdslimiet versoepeld.
- Definitieve browserselectie: 30/30 in 2,7 minuten, productiebuild en tijdelijke
  administraties met providers uit. Kandidaat
  aa5a934aaa66a3bc348878a297590d9717aeb8e94301f602a24ade1462e84739
  blijft gelijk. Dit is geen volledige eindronde van alle 167 browsergevallen.
  Bewijs: TEMP/contractor-ai-browser-results-zKMBAV en contractor-ai-phase224-*.
- Dezelfde private browserproef op 3002 voor/na: reeds bewaarde concepten gaven
  op pagehide eerst twee schrijfacties/vier key-inspecties/twee handlers; nu
  nul/nul/een. Beide proeven deden nul API-mutaties. Dit meet opslagwerk, geen
  gegarandeerde latencywinst. Desktop/mobiel zijn visueel gecontroleerd.
- Build en broncontract slagen (101/12/17/804). Volledige gzip/Brotli-overdracht
  is 689774/599453 bytes: 542/431 bytes meer dan Phase 223. Zeven budgetten blijven
  rood, met ongewijzigde grenzen. Readiness op 3002: HTTP 200, status ready.
  Geen volledige nieuwe Node/Postgres-, pakket-, container- of provideracceptatie;
  geen reset, commit, push, deployment of productie-gereedverklaring.

### 2026-10-02 - Phase 225: zichtbaarheidsgestuurde private foto's

- Gespreks- en opleverfoto's delen een documentgebonden zichtbaarheidobserver.
  Buiten beeld en in gesloten secties begint geen private download. Een marge
  van 256 px begint het laden vlak voor het scrollen naar de foto. Ontbrekende
  observerondersteuning behoudt de bestaande directe laadroute.
- Voorvertoningen reserveren hun afmetingen, decoderen asynchroon en tonen foto's
  ongecropt. Scopewisseling verbergt oude beelden direct, annuleert aanvragen en
  trekt object-URL's in; unmount doet hetzelfde. Een bekeken foto blijft in de
  gemounte viewer voor snel terugscrollen. Geen nieuwe persistente fotocache,
  cross-client hergebruik of garantie op begrensd geheugen na een hele tijdlijn.
  Private autorisatie, checksumcontrole en offline wachtrijen blijven behouden.
- Nieuwe regressies eerst rood: acht van negen falen tegen de oude eager viewer.
  Gerichte frontendselectie daarna 46/46; volledige suite 450/450 in 75 bestanden.
  Laatste herhaling na de definitieve fotoframe-CSS: 450/450 in 134,53 seconden.
  Gerichte Node-contracten 86/86, zonder skips, met tijdelijke administraties en
  lokale model-fixtures; dit is geen live AI- of WhatsApp-provideracceptatie.
- Eerste browserselectie 31/32: de uitgebreidere opleverfixture heeft twee foto's,
  terwijl een oude test een enkele afbeelding aannam. Die controle kiest nu de
  exacte naam van de antwoordfoto; bestaande veiligheidsasserties blijven staan.
  Definitieve selectie 32/32 in 3,8 minuten op de productiebuild, providers uit.
  Dit is een selectie uit 168 ontdekte browsergevallen, geen volledige eindronde.
- Native Chromium, desktop 1440x1000 en mobiel 390x844: twaalf echte private
  fixtureuploads, zes foto-aanvragen na het bekijken van begin en einde; zes
  niet opgehaald. Een gesloten opleversectie doet nul foto-aanvragen, openen
  doet precies een geautoriseerde read. Fotoframes veranderen maximaal 1 px bij
  laden. Geselecteerde toegankelijkheids-, containment- en browserfoutcontroles
  slagen; beide actuele screenshots bekeken zonder clipping of overlap. De
  fixturefoto's zijn kleine test-PNG's: dit bewijst aanvraagbesparing, niet een
  gemeten algemene snelheidswinst voor grote bouwfoto's of echte telefoons.
- Definitieve kandidaat:
  74b949734cf99e3510343145a2fcb15616968e3a1dd45aa57e3819a05e2db52e.
  Bewijs: TEMP/contractor-ai-browser-results-kAkHHS en contractor-ai-phase225-*.
  Volledige en aanvullende lint slagen; broncontract slaagt (101/12/17/807).
- Bundelgzip/Brotli 690343/600029 bytes: 569/576 bytes meer dan Phase 224.
  Zeven gates blijven rood: totaal gzip 690343/578500, Brotli 600029/540000,
  clientDelivery 9956/8500, operationalRecovery 4239/4100, recoveryCase 3941/3000,
  replacement 1672/1600 en recoveryActions 1038/900. Geen grens verhoogd, asset
  weggelaten of deelbundel hernoemd. De bestaande circulaire-chunkwaarschuwing
  blijft open; geteste browserworkflows hebben geen bijbehorende runtimefout.
- Geen volledige nieuwe Node/Postgres-, pakket-, container-, provider- of
  productieacceptatie. Geen operatorreset, commit, push of deployment. Het
  productie-gereeddoel en grotere bundelverkleining blijven open.
- Na documentatie blijft de definitieve kandidaathash gelijk en het volledige
  bundelrapport exact ongewijzigd. Laatste broncontract en diffcheck slagen.
  Bestaande lokale applicatie op 3002: HTTP 200, status ready, database ready,
  private bewijsopslag verified. Alle eigen testprocessen zijn voltooid; de
  lokale app blijft draaien. Lokale readiness is geen productieacceptatie.

### 2026-10-02 - Phase 226: stabiele runtimecache en volledige verificatierondes

- CommonJS-interop verhuist naar dezelfde React-bundel als de JSX-bridge. De
  React-bundel importeert de veranderende startbundel niet meer. Twee echte Vite-
  fixturebuilds met een gewijzigd lazy scherm behouden exact dezelfde React-
  bytes en bestandsnaam; het scherm verandert wel. Geen vervangende React-runtime.
  Nieuwe controles eerst rood (twee fouten), daarna 48/48 gerichte Node-tests groen.
- Productiebuild: 287 modules, 15,06 seconden; browserherbouw 15,13 seconden.
  Geen eerdere circulaire-chunkwaarschuwing. Bundelgzip/Brotli 689580/599374 bytes,
  763/655 minder dan Phase 225. Alle zeven oorspronkelijke gates blijven rood:
  gzip 689580/578500, Brotli 599374/540000, clientDelivery 9926/8500,
  operationalRecovery 4238/4100, recoveryCase 3938/3000, replacement 1673/1600,
  recoveryActions 1040/900. Geen asset weggelaten of grens verhoogd.
- Brede backendronde: alle 236 geisoleerde bestanden, 1024/1024 tests zonder skips,
  788,28 seconden. De volgende PostgreSQL-fase faalde op de herstartte fixture
  zonder TLS en bleef hangen doordat de adminverbinding voor een vroege
  verificatiefout niet werd gesloten. Alleen de drie aantoonbaar bij die foutieve
  runner horende processen zijn gestopt. Deze gecombineerde opdracht is niet groen.
- Negen PostgreSQL-contractsetups delen nu een verifierende verbindingsfunctie
  die bij handshake- of TLS-falen sluit en de oorspronkelijke fout behoudt.
  Vijf nieuwe unitregressies eerst rood; plus een echte negatieve TCP-proef die
  onbeveiligde toegang afwijst en in 246,22 ms afloopt zonder socketlek. De
  certificaatcontrole blijft streng; productie-backendbronnen zijn ongewijzigd.
- Eigen tijdelijke loopbackfixture gecontroleerd: wegwerpdatabasenaam, geen
  persistente mounts, eigen validatielabel. Alleen die fixture kreeg een eendaags
  lokaal certificaat met localhost/127.0.0.1-SAN. Definitieve serial stage:
  alle 16 PostgreSQL-testbestanden, 109/109 zonder skips in 378,63 seconden,
  sslmode=verify-full en TLSv1.3 geverifieerd. Objectopslag is een lokale test-double.
  Container daarna weer gestopt; geen systeemwijde CA of productieconfig veranderd.
- Volledige frontend: 450/450 in 75 bestanden, 105,90 seconden. Volledige lint,
  broncontract (101/12/17/807) en diffcheck slagen. Nieuwe npm-audit meldt nul
  bekende kwetsbaarheden, inclusief ontwikkelafhankelijkheden; geen certificering.
- Bewijs tot deze checkpoint: TEMP/contractor-ai-phase226-cache-red.log,
  cache-green.log, node-all.log, pg-cleanup-red.log, postgres.log, frontend.log,
  lint.log, audit.json, build.log, bundle.json en diffcheck.log (alle phase226-prefix).
  De volledige browserronde is hieronder afgerond; deze checkpointgegevens zijn
  geen volledige groene gecombineerde opdracht.
- Geen reset van operatorgegevens, commit, push, pakketpromotie, provideractie of
  deployment. Geen nieuwe volledige gecombineerde Node-opdracht, Windows/container-
  acceptatie of live EU/provider/deviceacceptatie. Het volledige productiedoel
  blijft open; deze checkpoint is geen gereedverklaring.
- Brede browserronde voltooid: alle 168 ontdekte identiteiten exact eenmaal in
  42 batches; 167 slagen, een helptest faalt op de aanname van een Engelse
  veldnaam na de Nederlandse voorkeur uit de voorafgaande HAI-test. Alle
  dekkingsrapporten zijn geldig; geen ontbrekende, dubbele of onverwachte cases.
  Kandidaat 407c89df113904ef7cb16c2ce69fbee7d739df6f7fe441e4561688fa002363bf
  bleef ongewijzigd. Bewijs: TEMP/contractor-ai-browser-results-xqU4UZ en
  contractor-ai-phase226-browser-all.log; deze opdracht eindigt terecht met code 1.
- Alleen de startselector van de helptest is taalbestendig gemaakt; exacte
  taalwaarden en alle bestaande workflow- en toegankelijkheidsasserties blijven.
  Nieuwe desktop/telefoonbeelden tonen de echte schermen. Het eerste telefoonbeeld
  bleek tijdens de bestaande 180 ms-menuovergang gemaakt; de test wacht nu op
  de daadwerkelijke verborgen navigatie, niet op een vaste slaap of ruimere timeout.
- Dezelfde vier tests, in dezelfde volgorde met behouden taalvoorkeur, slagen
  opnieuw: 4/4 in 18,3 seconden. Definitieve kandidaat
  df05a53d4c7adb60fece19cd2ba1b574aad2310fe81e20236dc1fcb12123c8eb;
  productiebuild-, runtime- en frontendrecords zijn exact gelijk aan de brede
  kandidaat; alleen browsertests verschillen. Geen verse volledige groene
  168-case-opdracht op die definitieve kandidaat. Bewijs:
  TEMP/contractor-ai-browser-results-jL0YHv en phase226-browser-final.log.
  Helpdesktop 1440x960 en telefoon 390x844 visueel bekeken: geen lege pagina,
  foutoverlay, afgeknipte tekst of overlappende navigatie in de uiteindelijke staat.
  Titeltarget, topickeuze, EN/NL-wissel, zoeken, containment, scoped axe en
  pageerrorcontrole slagen. Bestaande Playwright gebruikt: aparte Browser-plugin-
  skill/runtime niet beschikbaar; dit zegt niet dat CUA-browserbediening ontbreekt.
- Intake-observatie uit de brede ronde: 24 tekens in 132,3 ms inclusief
  testbediening, nul API-reads tijdens invoeren, hersteld na reload, precies een
  expliciet aangemaakte ledgeropdracht. Geen algemene gebruikerslatentieclaim.
- Resterende fotogrens uit broninspectie vastgelegd in TECHNICAL_AUDIT.md:
  signatuur/bestandsgrootte en zichtbaarheid beperken downloads, maar nog geen
  uitgepakte pixelgrens of aparte geautoriseerde kleine previews. Geen aanval,
  werkelijk telefoongeheugenprobleem of provideracceptatie gereproduceerd.
- Laatste volledige lint, broncontract (101/12/17/807) en diffcheck slagen na de
  helptestwijziging. Na documentatie is de definitieve kandidaat onveranderd en
  het volledige bundelrapport exact gelijk; zeven gates blijven rood. Eigen
  PostgreSQL-fixture staat weer gestopt. Lokale app op 3002 meldt ready met
  database ready en bewijsopslag verified. Alle eigen verificatieprocessen zijn
  voltooid; lokale app blijft draaien. Geen commit, push of releasegereedclaim.

## 2026-10-02 - Phase 227: begrensde echte fotoweergave en snelle profielinvoer

- De eerdere uploadcontrole accepteerde een geldig ondertekende PNG-header met
  400 miljoen aangegeven pixels: HTTP 201 in de rode API-proef. De gedeelde
  JPEG/PNG/WebP-controle decodeert nu echt met Sharp 0.35.5, verifieert het formaat
  en weigert beschadigde bestanden, meer dan 64 miljoen pixels of 16384 pixels
  per zijde. De rode request geeft nu 415, zonder extra bericht of bestand.
- Een native conversie tegelijk, maximaal vier unieke toegelaten jobs, 32 MiB
  invoer en een 8 MiB/64-record/vijf-minuten previewcache. Acht gelijke verzoeken
  delen aantoonbaar een conversie. Voorvertoningen zijn statische WebP, maximaal
  960 pixels per zijde en 512 KiB, georienteerd en zonder overgenomen metadata.
  WebP/APNG-animatie wordt als eerste stilstaande frame weergegeven; origineel
  bewijs en checksum blijven onveranderd. Geen volledige RAM-garantie.
- De bestaande private `/photo`-route behoudt haar origineelcontract;
  `?preview=1` vraagt een kleine preview. Beide controleren huidige toegang en
  originele bytes; conversie controleert na afloop bron/toegang opnieuw. Een
  warme cache omzeilt geen ingetrokken token of gewijzigde bewijsinhoud.
- Browseraanvragen houden maximaal twee actieve bodyreads en 64 wachtenden aan.
  Een expliciete download krijgt voorrang; gesloten viewers verwijderen hun
  wachtende aanvragen. Alleen de specifieke tijdelijke processor-busy-response
  heeft maximaal twee retries. Toegangsweigeringen worden niet herhaald. Een
  mislukte preview houdt de originele download beschikbaar. Blob-URL's worden
  na gebruik/opruimen vrijgegeven; bezochte previews blijven voorlopig gemount.
- De onafhankelijke read-only review vond originele-downloadtoegang bij
  previewfouten, ontbrekende APNG-framegegevens en dubbele wachtrijtoelating.
  Alle drie zijn verwerkt in code en Node 22-regressies. Reviewprobes met Node 25
  gelden niet als ondersteunde runtimeacceptatie; de agent is afgesloten.
- De eerste volledige componentronde vond verlies van de vroeg ingevulde
  worker-skill. Profielwaarden worden nu direct afgeleid, met lokale edits
  gekoppeld aan account en exacte bron; een late initialisatie-effectkopie kan
  de invoer niet overschrijven. De browser vond daarnaast een ontbrekende
  locale bij fotoselectie in klantopleveringen. Drie rode componentcases maken
  die reproduceerbaar; defaultlocale en geselecteerde/historische foto's zijn
  hersteld. Geen ruimere deadlines of verwijderde assertions.
- Native fixtures zijn echte JPEG/PNG/WebP waar de uploaddecoder bereikt wordt,
  met behoud van bestaande semantische labels/checksum-, quota- en rolasserties.
  Browserkandidaatbinding omvat nu ook hun relatieve JavaScript-dependencyclosure
  buiten `e2e`. Twee eerst rode kandidaatcases eisen die binding/mutatieweigering.
  Docker- en Windows-bronmanifesten nemen `image-processor.js` op.
- Definitieve gerichte Node-ronde: 111/111 in 17 bestanden, geen skips,
  70,06 seconden. Definitieve volledige frontend: 464/464 in 76 bestanden,
  139,23 seconden. Er zijn 253 Node-bestanden; geen nieuwe volledige Node/PG-ronde
  in deze fase. Volledige laatste lint, broncontract (102/12/17/812) en npm-audit
  slagen; nul bekende kwetsbaarheden is geen onafhankelijke certificering.
- Een wegwerp-Linux-musl-container installeerde productieafhankelijkheden zonder
  lifecycle-scripts en doorliep alle 12 native tests met Node 22.23.3, een CPU en
  512 MiB. Officiele image-digest staat in het verificatierapport. Alleen een
  read-only TEMP-bronmount, geen ports/secrets/operatorgegevens. Container eindigt
  en wordt verwijderd; dit is geen volledig geaccepteerd productieimage.
- Browserpogingen: eerst 12/14 (locale en queryloze offline-photo-observer),
  daarna 13/14 (meetprobe fetchte een blob en werd terecht door CSP geblokkeerd).
  Alleen de observer is aangepast om de echte pathname te herkennen. De grote
  fotoproef observeert nu de reeds door de app gelezen body; geen CSP-aanpassing
  of extra geautoriseerde netwerkdownload. Een lege CDP-body uit de eerste
  poging telt niet als besparing. Playwright's tracefallback kan zonder bearer
  opnieuw lezen; die instrumentatieverzoeken krijgen 401, geen bewijsbytes.
- Dezelfde negen selectors/14 workflows slagen uiteindelijk 14/14, 1,5 minuut,
  op kandidaat 7a5b60374c02088e0a450b11bf350c43087f1ed97ac941a4e86abec16ba1ea2a.
  Bewijs: TEMP/contractor-ai-browser-results-zyk4O6 en
  contractor-ai-phase227-browser-accepted.log. Geen volledige 169-case audit.
  Desktop 1440x1000 en telefoon 390x844 visueel bekeken: meaningful content,
  vaste fotokaders, toegankelijke download, geen overflow/overlap/foutoverlay.
  Page-/consoleerrors, scoped axe, echte download en originele SHA-256 slagen.
  Bestaande Playwright gebruikt omdat de aparte Browser-plugin-skill ontbreekt;
  CUA-browserbediening is daarmee niet als afwezig aangemerkt.
- Synthetische 12MP-deur: 1639591 origineelbytes naar 3082 previewbytes,
  12192768 naar 691200 pixels; nul automatische origineelreads en een expliciete
  ongewijzigde download. Een aparte tijdlijn laadt zes van twaalf foto's.
  Dit is geen echte telefoon-RAM-, hosted-load- of universele snelheidsmeting.
- Laatste productiebuild: 16,72 seconden. Alle 113 JS/CSS-assets tellen mee.
  Ongewijzigde bundelgates blijven zevenmaal rood: gzip 690910/578500, Brotli
  600484/540000 en vijf oppervlakken. Deze fase voegt 1330 gzip/1110 Brotli bytes
  toe; beeldresourcewinst wordt niet als JavaScript-besparing gepresenteerd.
- Lokale app PID 27296 op poort 3002 blijft gezond/ready met SQLite en geverifieerde
  bewijsopslag, maar gebruikt de eerdere API. Een vooraf exact gecontroleerde
  eigen procesherstart werd door uitvoeringsbeleid geweigerd. Geen alternatieve
  terminatie, lock-bypass, provideractie of onbevoegd extern schrijven geprobeerd.
  `dist` is bijgewerkt; de nieuwe serverpreview vereist nog API-herstart.
- De gewone ondertekende backup weigert terecht de ontbrekende signing key.
  Een aparte private onderhoudscheckpoint via Node SQLite online-backup bewaart
  database, bedrijfs-/opslagbinding en operationele export. Integriteit en
  foreign keys slagen; zes bestandshashes zijn nadien gecontroleerd. Pad:
  TEMP/contractor-ai-phase227-local-checkpoint-Egcv7B. Dit is geen ondertekend
  product-restorepakket; geen sleutel verzonnen, geen operatorgegevens gereset.
- Overige bewijslogs onder TEMP met prefix `contractor-ai-phase227-`: image-red,
  node-final, delivery-red, frontend-final (461 vroegere groene cases),
  frontend-accepted (464 definitieve cases), linux-native, lint-final,
  release-contract, audit.json, bundle.json/log en local-checkpoint.log.
  Geen commit/push/pakketpromotie/deployment of productie-gereedverklaring.
  Lang-tijdlijn-browsergeheugen, worst-case decoderload, gehele actuele backend/
  browserronde, zeven bundelgates en echte provider/device/EU-acceptatie blijven open.

## Phase 228 - Uitgestelde financiele en middelenformulieren

- Scope: sneller dashboard starten zonder bestaande invoer, validatie,
  conceptherstel of goedkeuringsgrenzen te wijzigen. Geen backend-/migratie-/
  providerwijziging, operatorgegevens-reset, commit, push of pakketpromotie.
- FinanceActionDialog en ResourceActionDialog zijn onafhankelijk gecachte,
  pas-bij-gebruik geladen modules. De bestaande JSX is mechanisch verplaatst;
  nieuwe AST-vingerafdruktests controleren alle oorspronkelijke velden,
  voorwaarden, labels en callbacks. State en submitlogica blijven in App.
  De twee nieuwe grensgevallen faalden voor de extractie en slagen erna.
- Een gesloten laadvenster laat het dashboard bruikbaar; laat voltooide code
  opent geen gesloten formulier en veroorzaakt geen ledgeractie. Een lokale
  dialog-errorboundary vangt een importfout af zonder het dashboard te vervangen.
  Nederlands/Engels laad- en foutvenster en de oorspronkelijke sluitacties werken.
- Nieuwe componenttests controleren exacte budget- en hoeveelheidinvoer,
  verplichte onderbouwing, uitgeschakelde submit, callbacks, close tijdens laden
  en behoud van parentinvoer bij een afgevangen laadfout. De onafhankelijke
  schermtest controleert ook beide nieuwe gecachte modules.
- Browserpoging 1: 9/10 groen; de meettest wiste de bestaande budgetomschrijving
  niet voordat hij 100 tekens invoerde. Dat is gecorrigeerd zonder productinvoer
  of standaardomschrijving te verwijderen. Poging 2: 10/11 groen; scoped axe
  vond de echte 3,77:1 contrastfout in het kleine contextlabel. De gedeelde
  tekstkleur is verbeterd; de accessibility-assertie is niet afgezwakt.
- Definitieve browserronde: 11/11, 50,9 seconden; tijdelijke ledgers, geen echte
  provider, op candidate
  `2094aaaa12b9cf7a8ba2be2186f50000ec927abb61cdae3fd5286c5481231c6b`.
  233 build-, 84 runtime-, 220 frontend- en 158 browserbestanden gebonden.
  De gehele actuele set bevat 172 browseridentiteiten; geen volledige nieuwe
  audit geclaimd. Onderzocht: uitgesteld/vertraagd/falend formulier, mobiel
  navigeren, conceptherstel, tweetalige financien, middelen-/toegangsgoedkeuringen,
  mijlpalen, leveranciersfactuur en betaalbewijs, creditnota en financiele acties.
- Browserobservatie: 1 financiele moduledownload over 2 openingen, 0 downloads
  van het andere formulier, 0 ledgerwrites tijdens invoer, 1 bewuste
  goedkeuringsaanvraag met exact 1500,25 budget/1600,75 prognose. De geautomatiseerde
  reeks van 100 tekens duurde 383,5 ms; geen universele paint-/telefoonlatentieclaim.
  Desktop 1280x720 en mobiel 390x844: identiteit/inhoud, geen frameworkoverlay,
  normale consolegezondheid, scoped axe, containment en screenshotinspectie.
  De bewust gesimuleerde 503 maakt alleen de lokale formulierfout zichtbaar.
  Bestaande Playwright-route gebruikt omdat aparte Browser-plugin/skill ontbreekt;
  CUA-beschikbaarheid wordt niet ontkend.
- Volledige componentset: 472/472, 77 bestanden, 115,26 seconden. Gerichte Node-
  contracten: 69/69, 7 bestanden, geen skips, 18,05 seconden. Geen volledige
  254-bestands-/PostgreSQL-herhaling; backendcode bleef ongewijzigd.
- Definitieve build: 11,94 seconden. App: 519316 -> 496039 raw bytes,
  114871 -> 111438 gzip en 91931 -> 89635 Brotli, dezelfde meetmethode.
  Opstartbesparing: 23277 raw bytes; niet gelijk aan totale downloadbesparing.
  Alle 115 assets tellen mee. Zeven ongewijzigde gates blijven rood:
  gzip 693545/578500, Brotli 603599/540000, klantoplevering 11202/8500,
  herstel 4236/4100, case 3938/3000, vervanging 1673/1600, acties 1041/900.
  Totaal groeit 2635 gzip/3115 Brotli bytes; geen budgetten verhoogd of assets
  verborgen/hernoemd. Een read-only vertaaltabel-experiment liet grotere
  gecomprimeerde trie-output zien; die wijziging is niet geimplementeerd.
- Full lint en sourcecontract slagen: 102 canonical paths, 12 retired paths,
  17 hosted keys, 819 source files. Geen nieuwe dependency-installatie/auditclaim.
  Bestaande lokale PID 27296 is ongewijzigd waargenomen; eerdere API-herstart
  blijft door beleid geblokkeerd. Geen alternatieve terminatie of lock-bypass.
- Bewijs onder TEMP: `contractor-ai-phase228-{node-final,frontend-final,
  browser-initial,browser-accepted,browser-final,lint-final,
  release-contract-final,bundle-final}.log`; de eerste twee browserlogs bevatten
  expliciete rode pogingen, uitsluitend browser-final is de geaccepteerde run.
  `contractor-ai-phase228-bundle-final.json` bewaart alle groottes/hashes/failures.
  Definitieve browserartefacten: `contractor-ai-browser-results-3ngCXK/batch-001`;
  `dashboard-dialog-performan-50a98--exact-approval-safe-values-operator-workflows`
  bevat desktop/mobile screenshots en `dialog-observation.json`.
  Maximumperformance, volledige actuele suite/load/device/EU/provideracceptatie,
  lang-tijdlijn-browsergeheugen, zeven bundelgates en API-herstart blijven open.

## Phase 229 - Begrensde levensduur van gespreksfoto's

- Scope: resourcegebruik bij lange gesprekken begrenzen zonder bewijsbytes,
  autorisatie, originele downloads of vaste fotokaders te wijzigen. Geen backend-,
  migratie-, provider-, operatorgegevens-, commit-, push- of deploymentactie.
- `conversation-photo-visibility.mjs` deelt een observer per document via WeakMap.
  Maximaal acht previewleases worden toegelaten. Uitgesloten leases worden eerst
  vrijgegeven: verzoek afbreken, URL intrekken en image verwijderen. Opnieuw in
  beeld komen start een nieuwe geautoriseerde read. Requestidentiteit voorkomt
  dat oude afgebroken bytes een nieuwere preview overschrijven.
- Een hele tijdlijn verwijderen start geen overbodige siblingreads: herselectie
  na cleanup wordt samengevoegd in een microtask. Geen globale timers of nieuwe
  scrolllisteners. Een origineeldownload blijft lopen als alleen de preview buiten
  beeld raakt; unmount/scopewijziging blijft die download wel afbreken.
- Een toegankelijke NL/EN fotoknop selecteert een wachtende foto. Zonder observer
  blijft de limiet acht en werkt die selectie, maar geometrische offscreenrelease
  is dan niet gegarandeerd. De cap geldt voor app-previewleases, niet voor gehele
  browser/OS-RAM, geopende/downloadkopieen, offlinevaults of andere oppervlakken.
- Drie nieuwe resourcecases faalden voor de reparatie. Daarna zijn twee oude
  one-shot-obserververwachtingen aangepast aan doorlopende observatie tot unmount.
  Zes nieuwe regressies: release/reentry, limiet over twee scopes, stale abort,
  geweigerde herintrede, geen observer en onafhankelijk origineeldownloaden.
  Focused photo: 26/26. Volledige frontend: 478/478 in 77 bestanden, 112,62 seconden.
- Gerichte Node-ronde: 82/82 in negen bestanden, geen skips, 17,09 seconden.
  Bevat echte gesprek-API/auth/tamper/origineel- en native-imagechecks. Geen nieuwe
  volledige 254-bestands-/PostgreSQL-ronde; backendbron bleef ongewijzigd.
- Drie browserselecties zijn groen (10/10 elk). De definitieve voegt echte
  observer-onbeschikbaarheid en een mobiele wachtfoto-klik toe; geen nieuwe
  case-identiteit. Definitieve selectie: 10/10, 56,9 seconden, zes selectors,
  kandidaat `5c81b34203ec37a9b9d18f8929f422ca5cdce4b6ceb1d4c14469fb3574148262`.
  Gebonden: 233 build-, 84 runtime-, 220 frontend- en 158 browserbestanden.
  172 browseridentiteiten ontdekt; geen volledige actuele audit geclaimd.
- Echte private uploads en alle twaalf previews bezocht. Vaste frames blijven;
  normale viewport maximaal drie app-previewURLs, 22 gemaakt/20 ingetrokken/twee
  actief op het meetmoment. 168 encoded piekbytes geldt voor de kleine fixture,
  niet voor RAM. Fallbackcontext heeft acht previews; klik op de laatste wachtfoto
  laadt die en houdt acht vast. Na echte tokenintrekking weigert herintrede met
  404, zonder oude afbeelding terug te zetten. `scopedPreviewRequests` kan ook
  afgebroken/geweigerde reads bevatten en wordt niet als allemaal succesvol geteld.
- Aparte 12MP-deurfixture: 1639442 origineelbytes/2994 previewbytes,
  12192768/691200 pixels. Nul automatische origineelreads; een bewuste download
  bewaart originele SHA-256. Geen CSP-versoepeling of extra authenticated refetch
  voor de meting. Playwright-tracefallback zonder bearer krijgt terecht 401;
  dit is geen automatisch app-origineeldownloaden.
- Rendered QA: identiteit/meaningful content, geen foutoverlay, normale console/
  page-errorchecks, scoped axe en containment slagen. Definitieve 1440x1000 en
  390x844 deurfoto en mobiele wachtfoto visueel gecontroleerd. Bestaande Playwright
  gebruikt omdat de aparte Browser-plugin/skill ontbreekt, niet omdat CUA ontbreekt.
  De opzettelijke revocation-fout blijft als geweigerde read gedocumenteerd.
- Definitieve productiebuild: 13,28 seconden. App blijft 496039 raw/111438 gzip;
  Brotli 89536 (hash/compressievariatie, geen nieuwe startupbesparing geclaimd).
  Alle 115 assets tellen mee. Zeven gates blijven rood: gzip 694028/578500,
  Brotli 603995/540000, klantoplevering 11646/8500, herstel 4239/4100,
  case 3938/3000, vervanging 1672/1600, acties 1039/900. Totaal groeit met
  483 gzip/396 Brotli versus Phase 228; geen limieten verhoogd of assets uitgesloten.
- Definitieve full lint/sourcecontract/diffcheck slagen; contract 102 canonical,
  12 retired, 17 hosted keys, 819 sourcebestanden. Geen nieuwe dependencyauditclaim.
  Kandidaat na documentatie opnieuw geverifieerd. PID 27296 en de exacte eigen
  start-local-api-procesregel opnieuw waargenomen, niet herstart. `dist` actueel;
  nieuwe serverpreviews vereisen de eerdere policy-geblokkeerde API-herstart.
  Geen alternatieve terminatie, lock-bypass of tweede operator-API gestart.
- Bewijs onder TEMP: `contractor-ai-phase229-{photo-red,photo-initial,
  photo-focused-final,node-final,frontend-final,browser-initial,browser-final,
  browser-accepted,lint-accepted,contract-accepted,bundle-accepted}.log`;
  `contractor-ai-phase229-bundle-accepted.json` bewaart alle groottes/hashes/failures.
  Definitief browserbewijs: `contractor-ai-browser-results-UjW9X6`, inclusief
  `candidate.json`, `summary.json` en `batch-001`. Photo-resource-directory's
  bevatten desktop/mobile/wachtfoto screenshots en beide resourceobservaties.
- Bewuste afweging: vrijgegeven previews opnieuw bekijken kost een verse
  geautoriseerde netwerkread; geen all-network-work-reductie geclaimd. Echte
  telefoon/RAM/hostile-load, volledige actuele suites, zeven bundelgates, API-
  herstart, package/EU/provider/operatoracceptatie en maximumperformance blijven
  open. Productie-gereeddoel blijft actief, niet voltooid of geblokkeerd verklaard.

## Phase 230 - Zoekwerk in aanvraag- en offerteregisters

- Vorige doelturn: concrete vooruitgang (Phase 229 previewleasegrens, regressies
  en actuele browserbewijzen), geen no-progress of voltooidverklaring. Huidige
  scope: CPU-werk bij zoeken, volledige frontendcontrole en gerichte release-
  regressies. Geen backend-, operatorgegevens-, provider-, deployment-, commit-
  of pushactie. De gehele productieopdracht blijft intact en actief.
- Verse instructies/skillinventaris en memoryregistry gecontroleerd. De oude
  Flask-notitie is historisch; huidige Node/React-bronnen zijn leidend. React-
  performance- en frontend-QA-skill toegepast; bestaande Playwright gebruikt
  omdat de aparte Browser-plugin/skill ontbreekt. CUA is niet als afwezig verklaard.
- `PipelineWorkspace` en `BidPackageWorkspace` serialiseerden complete geneste
  dossiers bij iedere zoekwijziging. Nieuwe tests reproduceren 5050 omzettingen
  voor 50 aanvragen (eerste zoekopdracht plus 100 edits), 5000 voor 50 pakketten
  over 100 edits, en zoekwerk voor de verborgen aanvraagweergave.
  Eerste run: vier rood/drie groen; drie echte resource-regressies plus een
  testlocator die ten onrechte hoofdletter `All` verwachtte. Na reparatie bleef
  alleen die locator rood; de werkelijke labelwaarde `all` is behouden.
- Status/stage-geschikte records worden los van de zoekopdracht gememoiseerd.
  Exacte genormaliseerde JSON-zoektekst ontstaat uitsluitend tijdens zoeken,
  eenmaal per geschikte bron/filterversie. Lege zoekopdracht/verborgen aanvraag-
  weergave bouwt geen teksten; wissen/verwisselen vervangt de referenties.
  Geneste velden, hoofdletters/spaties, volgorde en originele selectieobjecten
  blijven gelijk. Bron/filterwijzigingen bouwen opnieuw; autorisatie/goedkeuring/
  bedrijfsbesluiten worden niet gecachet. Bewuste afweging: tijdelijk extra
  zoektekstgeheugen tegen minder CPU-werk, geen gehele-browser-RAM-grens.
- Zeven nieuwe regressies slagen. Gerichte frontend: 21/21 over drie bestanden,
  6,54 seconden. Gehele frontend: 485/485 over 78 bestanden, 150,58 seconden.
  Nieuwe bronarrays en filterwissels maken oude zoektekst ongeldig zonder de
  getypte zoekintentie te wissen; selectie behoudt de exacte oorspronkelijke rij.
- Uitgebreide Node-selectie 1: 95/97 groen, twee verouderde bronasserties na de
  Phase 228 formuliersplitsing. Selectie 2 inclusief exacte JSX-contracten:
  98/99 groen, de volgende verouderde tekstassertie kwam na de eerste aan bod.
  Drie oorspronkelijke labels worden nu gecontroleerd in FinanceActionDialog,
  met extra parent-draftbinding; geen assertie, scenario of JSX-vingerafdruk geschrapt.
  Definitief: 99/99, negen bestanden, geen skips, 9,43 seconden. Inclusief echte
  bid-API/auth, opportunity/bid lifecycle, offlinecompatibiliteit en build/browser-
  contracten. Geen volledige 254-bestands-/PostgreSQL-ronde geclaimd.
- Browserselectie 1: 23/23 groen, 1,4 minuut. Visuele inspectie zag een mobiel
  screenshot tijdens de 180ms drawertransitie; test vraagt nu aantoonbaar
  `visibility: hidden` voor capture, zonder vaste sleeps of CSS-aanpassing.
  Definitieve zelfde zeven selectors/23 workflows: 23/23 groen, 1,2 minuut,
  kandidaat `67c1b86967a951c2aced7c0c53cd01924db4ccad64c82999e0fbc9195675c5ab`.
  233 build-, 84 runtime-, 220 frontend- en 159 browserbestanden gebonden.
  Verse discovery: 173 browseridentiteiten; geen volledige audit geclaimd.
- Echte tijdelijke lokale ledgerfixtures: acht aanvragen en zes offertepakketten.
  Browser telt acht respectievelijk zes omzettingen ondanks typ- en geneste
  zoekwijzigingen; 13840/35404 tekstkarakters zijn scoped serialize-observaties,
  geen geheugen- of interactielatentiemeting. Geen vooraf gebouwd zoekindexwerk
  bij lege invoer, nul unsaved ledgerwrites, originele detailkeuze bevestigd.
  Bestaande omzetting, goedgekeurde bid/orderreceipt, alle geselecteerde dashboard-
  performanceflows, vertraagde/ontbrekende formulieren, conceptherstel en private
  foto/revocation/origineeldownloadchecks slagen op dezelfde definitieve kandidaat.
- Rendered QA: juiste titel/inhoud, geen frameworkoverlay, normale console/page-
  errorchecks, scoped axe en containment. Definitieve desktop 1440x1000/mobiel
  390x844 screenshots visueel bekeken; geen overlap met verborgen menu.
  Bewuste 503-importfout en geweigerde ingetrokken toegang blijven expliciete
  negatieve gevallen; trace-CDP-reads zonder bearer krijgen terecht 401.
- Definitieve build: 11,94 seconden. Pipeline: 3607 -> 3655 gzipbytes; bid:
  4380 -> 4426. App raw blijft 496039, gzip 111439/Brotli 89563 door gewijzigde
  chunkreferenties. Alle 115 assets tellen. Zeven onveranderde budgetgates rood:
  gzip 694138/578500, Brotli 604054/540000, klantoplevering 11646/8500,
  herstel 4238/4100, case 3940/3000, vervanging 1674/1600, acties 1041/900.
  Totaal +110 gzip/+59 Brotli versus Phase 229, geen downloadbesparing geclaimd,
  geen budgetten verhoogd, oppervlakken hernoemd of assets uitgesloten.
- Full lint, sourcecontract en diffcheck slagen. Broncontract: 102 canonical,
  12 retired, 17 hosted keys, 821 sourcebestanden. Kandidaat na docs opnieuw
  gecontroleerd; build/runtime/frontend gelijk aan eerste browserkandidaat.
  PID 27296/eigen start-local-api-procesregel opnieuw waargenomen; geen API-
  herstart of bypass. `dist` actueel; kleine serverpreviews vereisen de eerdere
  policy-geblokkeerde herstart. Geen tweede operator-API of provideractie.
- Bewijs onder TEMP: `contractor-ai-phase230-{search-red,search-focused,
  search-focused-final,frontend-final,node-final,node-accepted,node-final-accepted,
  browser-initial,browser-final,lint-final,contract-final,bundle-final}.log`.
  Alleen `node-final-accepted` is de groene definitieve Node-run. Beide browser-
  runs zijn groen; uitsluitend final heeft de versterkte mobiele capturecheck.
  `contractor-ai-phase230-bundle-final.json` bevat alle hashes/groottes/failures.
  Definitief browserbewijs: `contractor-ai-browser-results-MMZTpp/candidate.json`,
  `summary.json` en `batch-001/preconstruction-search-per-86062-yping-without-ledger-writes-operator-workflows`
  met drie screenshots en `indexed-search-observation.json`. Eerste root: HBeX53.
- Zeven bundelgates, echte telefoon/paint/RAM/hostile-load, gehele actuele suites,
  API-herstart en package/EU/provider/operatoracceptatie blijven open. Geen
  universele maximumperformance- of productie-gereedverklaring.

## Phase 231 - Veilige en volledige Node-verificatie

- Vorige doelturn: concrete CPU-/browservooruitgang (Phase 230), geen
  voltooidverklaring. Huidige scope: volledige backendcontrole na performancewerk
  en afscherming van testresources. Productruntime/UI ongewijzigd; de gehele
  productieopdracht blijft actief. Geen commit/push/provider/deploymentactie.
- Instructies, huidige Node/React-context en diagnosis-skill gecontroleerd.
  Memoryregels 944-946 zijn historische Flask-context, niet de huidige runtime.
  Bestaande Node-runner, fixtureguard, TLS-CI en beschikbare lokale Docker/Node
  gebruikt. Geen UI-wijziging: browserbediening/screenshotronde niet nodig.
- Parentomgeving werd volledig overgenomen. Eerste kleine repro: vier rood,
  een PostgreSQL-skip. Drie ontbrekende nieuwe helpers en de echte ongewenste
  tijdelijke preload; bovendien sloeg geerfde NODE_TEST_CONTEXT de nested test
  over. Geen echte operatorfile of provider gebruikt voor de repro.
- De canonical runner laat uitsluitend noodzakelijke platforminstellingen door,
  forceert lokale defaults/uitgeschakelde kanalen en behoudt alleen expliciet
  guarded PostgreSQL-testconfiguratie plus publieke CA. Onbekende secrets,
  operatorpaden, proxies, Node-hooks en recursive testcontext verdwijnen.
  Expliciete omgevingssnapshots vallen niet terug op de parent-testdatabase.
- Trusted preload geeft ieder testproces een eigen tijdelijke STATE_FILE;
  TEMP/TMP/TMPDIR en cleanup blijven guarded. Native solver/buildthreads behouden
  de expliciete fixtureopslag van hun parent. Dit is geen OS/netwerksandbox.
- Eerste brede poging: 1018/1039 groen, 21 rood door PID-mapcreatie in native
  threads (planner en Vite). Shared PostgreSQL-stage startte niet. Tweede poging:
  1033/1037 groen, drie startupfouten door opnieuw gebruikte Windows-PIDs en
  een legacy-restorefixture met impliciete geerfde STATE_FILE. Ook deze poging
  startte de PostgreSQL-stage niet; geen volledige groene run geclaimd.
- Thread- en PID-hergebruik zijn apart rood gereproduceerd. Atomische unieke
  processubmappen voorkomen botsing/overschrijven. CLI-restorefixtures strippen
  defaults expliciet; alle oorspronkelijke checks behouden, v2 controleert nu
  ook de exacte teruggezette state. Productrestoreprecedence niet veranderd.
- Gerichte definitieve reparatieronde: 136/138 over tien bestanden, twee
  PostgreSQL-skips, 54,50 seconden. Laatste kleine identityrepro ervoor:
  vijf groen/twee rood/een skip; beide echte problemen daarna gerepareerd.
- Definitieve gehele canonical ronde: alle 255 bestanden, 1156/1156, nul
  failures/skips. 238 onafhankelijke bestanden: 1039 checks, vier workers,
  233,974 seconden; 17 gedeelde PostgreSQL-bestanden: 117 checks, een worker,
  383,627 seconden. Node 22.23.2, dedicated loopback PostgreSQL 16, tijdelijke
  testrol/database/een-dag-CA en sslmode=verify-full; stream.authorized bevestigd.
  Fixtures gebruiken tmpfs, maximaal twee container-CPUs/1 GiB en geen business-
  volumes. Alleen eigen gelabelde containers/certificaten worden opgeruimd.
- Na de gehele ronde zijn uitsluitend Node-runner-testasserties aangescherpt:
  expliciete recursive-context-input, daadwerkelijk child-executiereceipt en
  bewijs dat de afgeronde runtimefolder weg is. Laatste acht cases opnieuw met
  echte verified PostgreSQL TLS: 8/8, geen skips, 0,706 seconden testtijd.
  Geen nieuwe gehele ronde na deze test-only asserties en geen runtimewijziging.
- Full lint, sourcecontract en diffcheck slagen. Contract: 103 canonical paths,
  12 retired paths, 17 hosted keys, 823 sourcefiles. Trusted testbootstrap verplicht.
  Verse vergelijking: alle vier Phase 230 UI-kandidaatgroepen identiek,
  SHA 67c1b86967a951c2aced7c0c53cd01924db4ccad64c82999e0fbc9195675c5ab,
  233/84/220/159 bestanden. Geen nieuwe frontend/browser/buildronde geclaimd;
  485 component- en 23 geselecteerde browsertests blijven vorig bewijs.
- Verse budgetcheck: alle 115 assets, zeven onveranderde failures:
  gzip 694138/578500, Brotli 604054/540000, client delivery 11646/8500,
  recovery 4238/4100, case 3940/3000, replacement 1674/1600, actions 1041/900.
  Geen assets uitgesloten, grenzen verhoogd of download-/eindgebruikersnelheids-
  winst geclaimd in deze test-only fase. Bestaand operator-PID 27296 waargenomen;
  geen API-herstart, tweede operatorserver of eerdere policybypass.
- Bewijs onder TEMP: contractor-ai-phase231-{runner-red,runner-green,worker-red,
  identity-red,focused-final,focused-accepted,node-all,node-final,node-accepted,
  runner-tls-final,lint-final,contract-final,bundle-final}.log en bundle-final.json.
  Uitsluitend node-accepted is de groene gehele ronde; runner-tls-final bewaart
  de laatste acht aangescherpte cases. Lokale owned-fixtureharness:
  contractor-ai-phase231-postgres-check.cjs; geen operatorcredentials erin.
- A43/README/audit/matrix/verificatieverslag bijgewerkt. Zeven bundelgates,
  gehele browser/load/device-RAM, de eerdere pending API-herstart en package/
  EU/provider/operatoracceptatie blijven open. Geen maximumperformance- of
  productie-gereedverklaring; betekenisvolle voortgang, volledige scope behouden.

## Phase 232 - Kleinere compressie en werkelijke browserlevering

- Huidige prioriteit: maximale resource-efficientie en snelle interactie; volledige
  productieopdracht behouden. Geen commit/push/provider/deploymentautorisatie.
  AGENTS/context, huidige Node/React-bronnen, historische memoryregels 944-946,
  React- en frontend-debuggingskills en bestaande runners gecontroleerd. Browser
  plugin/skill niet beschikbaar; reguliere Playwright via canonical runner
  gebruikt. CUA is beschikbaar maar voor deze test niet nodig.
- Eerste compressieprobe had foutief escaped regex en telde nul assets: ongeldig
  bewijs. Herhaalde probe controleert daadwerkelijk 115 assets, countgelijkheid
  en exacte decompressie. Quality 11 alleen: 604054 -> 591854 in 3,505 seconden.
  Twee kleine assets groeien; kiezen van minimum quality 10/11 geeft 591842.
  Deterministische pluginfixtures bewijzen beide keuzes met ongewijzigde bron.
- Alle 115 uiteindelijke raw SHA-256-identiteiten, namen en gzipmaten zijn exact
  gelijk aan Phase 231. Alle sidecars decomprimeren exact, geen asset groeit.
  Totale Brotli-besparing 12212 bytes (2,02%); extra compressiewerk alleen bij
  bouwen. JS/App blijft raw 496039, gzip 111439; App Brotli 89563 -> 87874.
- Eerste twee browserrondes: ieder 18/19 groen, echte Content-Length/bytecheck
  rood. Aanname onvolledige Playwright headers was onjuist: allHeaders lost het
  niet op. Veilige assetheaders uit trace tonen chunked dynamische Brotli.
  Reguliere Chromiumheader gzip, deflate, br, zstd koos via acceptsEncodings
  eerst gzip en sloeg de sidecar over; compression gebruikte daarna quality 4.
- Read-only operatorobservatie: gewone browserheader levert App 108025 bytes,
  geen Content-Length, bron correct maar sidecar niet gelijk. Expliciet br
  levert wel de sidecar van 87874 bytes. Geen business/API-write hiervoor.
  Bestaand PID 27296 blijft lopen; eerder geblokkeerde restart niet omzeild.
- Raw-wiretest reproduceert probleem (4/5 groen). Expliciet pinned direct
  Negotiator 1.0.0 gebruikt zijn eigen preference-optionsobject. Oudere nested
  compression-parser 0.6.4 gebruikt een array: eerste gekopieerde aanroep bleef
  rood (101/102). Huidige juiste API slaagt. Bestaande gzipvoorkeur/identity,
  Brotli q=0, deflate, exact bron/sidecar en HEAD worden werkelijk getest.
  Manifest/lock/installed versie gelijk; offline lock-only update, geen download.
- Definitieve Node-selectie: 102/102, nul failures/skips, 32,136 seconden over
  static/API/auth/proxy/plugin/budget/JSX/candidate/runner/release-contracttests.
  Phase 231's gehele 1156-case TLS-ronde blijft historisch; geen nieuwe gehele
  backend/PostgreSQL- of componentronde na deze runtimewijziging geclaimd.
- Canonical productbuild slaagt in 14,38 seconden. Definitieve vier geselecteerde
  browserbestanden: 19/19 in 45,3 seconden, geen assertion verwijderd. Kandidaat
  67f607bc3a3b7203997efc6d4cd5af069e60b0c49074dcffe39bc471daa43db4,
  build/runtime/frontend/browser 233/84/220/160. Verse discovery 174 cases.
  Nieuwe transportcase bewijst 23 assetresponses met exacte decodedbytes,
  sidecarlengtes en Resource Timing; totaal 287857 encodedbytes voor die responses.
  App JS werkelijk 87874: verschil 20151 bytes (18,65%) met oude operatorresponse,
  geen algemene paginasnelheids- of serverloadclaim. Tabwissels, uitgesteld laden,
  fout/annulering, grote crewdirectory en index-search blijven functioneel.
- Desktop- en 390x844-screenshots daadwerkelijk bekeken, geen incoherente overlap
  of horizontale overflow. Scoped topbar/sidebar axe en consolechecks groen.
  Geen volledige app-WCAG of echtetelefoonacceptatie geclaimd.
- Full lint en sourcecontract groen: 103 canonical/12 retired/17 hosted/824 files.
  Budgetgate blijft zevenmaal rood: gzip 694138/578500, Brotli 591842/540000,
  client delivery 11646/8500, recovery 4238/4100, case 3940/3000,
  replacement 1674/1600, actions 1041/900. Geen asset weggelaten of limiet verhoogd.
- Bewijs onder TEMP: contractor-ai-phase232-{compression-probe-accepted,
  compression-by-asset,operator-wire-baseline,lock-update,node-focused,
  negotiation-red,node-accepted,node-accepted-final,browser,browser-final,
  browser-accepted,lint-final,contract-final,bundle-final}.log en bundle-final.json.
  Alleen node-accepted-final en browser-accepted zijn definitief groen; oudere
  browser-final en node-accepted bewaren nog rood bewijs. Browserroots FSRdoN
  en ltb4jq rood, JRbi23 groen. JRbi23 bevat candidate.json/summary.json en
  batch-001/asset-compression-real-bro-8b2e5-on-increasing-Brotli-bodies-operator-workflows
  met transport-JSON en desktop/mobile-PNGs.
- A44/README/matrix/audit/verificatie bijgewerkt. Lopende poort 3002 gebruikt nog
  eerdere backend; nieuwe normale browserlevering vereist pending API-herstart.
  Geen tweede operatorserver, operator-datareset, package of externe wijziging.
  Zeven gates, volledige browser/load/device/RAM en EU/provider/operatoracceptatie
  blijven open; voortgang, geen universele maximumperformance-/gereedverklaring.

## Phase 233 - Snellere invoer bij klantopleveringen

- Vorige doelturn is geverifieerde voortgang (Phase 232), geen voltooidverklaring.
  De gehele productieopdracht blijft actief; huidige prioriteit is maximale
  resource-efficientie. Geen commit/push/provider/deploymentautorisatie.
  AGENTS/context, historische memoryregels 944-946 en actuele Node/React-bronnen
  gecontroleerd. React- en frontend-debuggingskills, canonical Node/browser-
  runners en de volledige Vitest-suite gebruikt. Specifieke Browser-plugin/skill
  ontbreekt; reguliere Playwright gebruikt. CUA beschikbaar, hier niet nodig.
- Klantopleveringen bouwden bij iedere veldwijziging bestaande geschiedenis,
  fotokeuzes en gekozen-scope lookup opnieuw. Huidige JSX-weergaven/berekeningen
  volgen nu hun werkelijke data/selection/role/locale/action-gate dependencies.
  Stabiele open/set/older-page callbacks behouden exact dezelfde bron en waarden.
  Cache houdt uitsluitend de huidige weergave aan, geen globale historycache;
  minder herhaald werk, geen claim van minder totale browser-RAM.
- Kandidatencontrole indexeert eenmalig exact dezelfde vier blokkerende aanbod-
  statussen (pending/available/expired/source_changed). Oudere fotopagina's maken
  een Set van incoming IDs en behouden incoming-first volgorde/waarden. Geen
  bericht, serverrecord, scope, goedkeuring of privacygrens verwijderd.
- Zes nieuwe regressies: nul extra history/photo/scope propertyreads tijdens
  unrelated typing in een 40-offer/40-photo fixture; lineaire identiteitgrenzen
  voor 60 offers/60 candidates en 100 retained/50 incoming photos; alle blokkerende
  states, bronwijziging en expliciete herbevestiging, rol/locale-updates, selectie,
  tien-fotocap en late oudere-paginaresponse na annulering. Zes oude controletests
  blijven behouden. Tijdzone wordt per render opnieuw bepaald; history wordt
  opnieuw geformatteerd bij OS-zonewisseling zonder nieuw dossier. Dit voorkomt
  een nieuw verouderd-datumeffect van memoization.
- Eerste selecties: 6/6 bestaande cases, vervolgens 10/10, 11/11, en na laatste
  tijdzoneguard 12/12 over twee bestanden, 9,15 seconden. Eerste hele component-
  ronde 490/490 over 79 files, 118,03 seconden. Definitieve hele ronde na guard:
  491/491, 79 files, twee workers, 129,66 seconden; geen cases/asserties verwijderd.
- Eerste canonical browserronde: zeven geselecteerde cases groen in 38,8 seconden,
  kandidaat 7c75c31b3bbfe6555a3602cbb268d1a84ad9dbcd67799683443ed19456cc2ea7,
  root L4lu9W. Na tijdzoneguard opnieuw productbuild en dezelfde zeven flows:
  7/7 in 41,9 seconden, build 16,24 seconden, kandidaat
  781fd1f93f784e5dd0e049e83837e9a55e2acaf4e5dea6cb4af60f6548a26148,
  root xKyu2t, groepen 233/84/220/160. Discovery blijft 174, geen volledige audit.
- Browser gebruikt echte isolated-ledger intake/retained work/access/publication,
  onafhankelijke goedkeuring, klantreactie/foto, review, export en intrekking.
  Getters op originele fetch-json-waarden tellen alleen reads, vervangen geen API-
  payload. Tijdens withdrawal-draft typing blijven history-title reads 4 -> 4;
  photo-attachment reads blijven gelijk tijdens recipient typing. Concept wordt
  geannuleerd; het echte aanbod blijft pending met dezelfde ID. Gerelateerde
  lazy/cancel/error-formflows, private previewleases, revoke/404/401 en exact
  original-download bewijs groen; negatieve securityresponses zijn opzettelijk.
- Node-selectie over elf bestanden: eerst 111/111 in 27,663 seconden; definitief
  111/111 in 27,630 seconden, nul skips/failures. Delivery/conversation domain/API,
  image processing, server/static transport, budgets, JSX fingerprints, candidate
  en releasecontract. Backendbron niet gewijzigd; geen nieuwe volledige Node/
  PostgreSQL-ronde geclaimd. Phase 231's verified-TLS ronde blijft vorig bewijs.
- Alle 115 assets tellen. Definitief gzip 694346/578500 en Brotli 591954/540000,
  +208/+112 versus Phase 232; App raw 496039, CSS 246349. Nog vijf surfacefailures:
  client delivery 11857/8500, recovery 4239/4100, case 3940/3000,
  replacement 1674/1600, actions 1040/900. Geen budget verhoogd. CPU-workwinst,
  geen totale downloadbesparing; dit verklaart de kleine bytekost eerlijk.
- Definitieve office-desktop en client-mobile screenshots daadwerkelijk bekeken:
  contractor-client-delivery-1790952148475-{office,desktop,mobile}.png in TEMP.
  Browserroot xKyu2t heeft candidate.json/summary.json, transport-JSON en actuele
  dashboard desktop/mobile-screenshots. Scoped office/client/nav axe en console
  checks groen; geen onafhankelijke assistive-tech/echtetelefoonacceptatie.
- Bewijs onder TEMP: contractor-ai-phase233-{delivery-existing,delivery-focused,
  delivery-focused-final,delivery-tz,frontend-full,frontend-final,browser,
  browser-final,node,node-final,bundle,bundle-final,lint,lint-final,contract,
  contract-final,operator-assets,operator-assets-final,diff-final}.log en bundle{,-final}.json. Alleen frontend-final/browser-final/
  node-final/bundle-final beschrijven de laatste tijdzoneguard-kandidaat.
- Read-only public entry-check bevestigt dat bestaande poort 3002 de huidige
  buildbytes serveert; definitieve check vergelijkt ook de actuele deliverymodule
  byte-voor-byte met dist. Full ESLint, sourcecontract (103/12/17/825), diffcheck
  en definitieve browsercandidate-hercontrole slagen. Operator-PID 27296 blijft ongewijzigd; UI na page reload,
  maar de eerdere backend-sidecarfix vereist nog de pending API-herstart. Geen
  policybypass, tweede operatorserver, operator-datareset of externe wijziging.
- A45/README/matrix/audit/rapport bijgewerkt. Zeven bundle-gates, volledige
  browser/load/device/RAM en package/EU/provider/operatoracceptatie blijven open.
  Volledige doelstelling behouden; geverifieerde voortgang, geen releaseclaim.

## Phase 234 - Hele-buildmeting, veilige vertalingen en volledige browseraudit

- Volledige productieopdracht behouden; de huidige prioriteit blijft resource-
  efficientie en snelle navigatie/invoer. Geen nieuwe commit/push/deployment-
  autorisatie. AGENTS, huidige Node/React-code en historische memoryregels
  944-946 gecontroleerd; de oude Flask-instructie is niet de huidige architectuur.
  React-performance- en frontend-debuggingskills, canonical runners, Babel-AST,
  Terser/compressiemetingen en daadwerkelijke Chromium gebruikt. Aparte Browser-
  plugin/skill ontbreekt; reguliere Playwright, niet afwezigheid van CUA, is de
  reden voor deze route. Geen extra dependency, provider of deployment nodig.
- Reproductie: een onbekende constructor/prototype-achtige labellookup gaf een
  overgeerfde functie/object terug en crashte variabelenvervanging. Own-property
  lookup herstelt letterlijke fallbacks; expliciete eigen constructorlabels
  blijven geldig. Initiele locale-regressies 6/8, met de echte TypeError en de
  experiment-volgordetest rood. Grote data-URL-stack in de eerste foutlog leidde
  tot onnodig enorme output; de nieuwe raw-fallbackfixture gebruikt voortaan een
  tijdelijk modulebestand. Logreader is normaal gesloten, geen process-kill.
- Compactor houdt 3376 bestaande tokenidentiteiten aan, zet compactwaarden op
  exact hun tokenindex en sorteert alleen pure retained-properties op Engelse
  key. Niet-letterlijke evaluationvolgorde blijft intact. Vijf extra regressies
  bewaken volledige referenced-catalogue trouw, beide talen/interpolatie, eigen
  en onbekende prototypekeys, malformed tokens, source-herordening en evaluatie.
  Geen vertaaltekst, businessstatus, autorisatie of goedkeuringsgrens verwijderd.
- Het eerste experiment sorteerde tokens op Nederlandse tekst. Standalone-
  compressieprobe leek gunstig, maar echte build werd 695092 gzip/592804 Brotli:
  +746/+850 tegenover Phase 233, ondanks 904/974 besparing in de catalogus.
  Daarom verworpen. De eerste volledige audit is bewust met Ctrl-C gestopt
  nadat vier geldige groepen/16 cases passeerden; geen timeout, geen volledig
  bewijs en geen operator-stop. Alle eigen processessies daarna gesloten.
- Definitieve kleine winst bij stabiele tokens: alle 115 assets gzip 694105,
  Brotli 591900; -241/-54 tegenover Phase 233. Catalogus DOkPuxeq: raw 203765,
  gzip 58398, Brotli 50486. App raw 496039, CSS 246349. Iedere sidecar round-tript.
  Zeven oorspronkelijke gates blijven rood: total gzip 694105/578500, Brotli
  591900/540000, client delivery 11857/8500, recovery 4239/4100, case 3939/3000,
  replacement 1673/1600 en actions 1039/900. Geen budgets verhoogd of assets
  uitgesloten; geen claim van grote snelheidswinst uit deze beperkte bytewinst.
- Corrected focused Node: 88/88, nul skips/failures, 20,790 seconden over acht
  locale/JSX/compression/bundle/candidate/runner/release bestanden. Eerdere
  experimentselecties 86/86 en 88/88 blijven apart. Hele frontend na lookupfix:
  491/491 over 79 bestanden, twee workers, 132,16 seconden; daarna alleen
  build-compaction gecorrigeerd, geen componentcode gewijzigd. Geen nieuwe
  volledige backend/PostgreSQL-ronde; Phase 231's verified-TLS bewijs historisch.
- Corrected selected browser: 2/2 in 13,1 seconden, root YnKaNS. Nieuwe case
  importeert de werkelijk geserveerde minified export en controleert 4434
  referenced entries, 8868 taaloutputs en acht onbekende/malformed keys; nul
  failures en nul ledgerwrites. Taal EN -> NL daadwerkelijk uitgeoefend.
- Volledige accepted audit: 175/175 unieke discoverable cases, 44/44 batches,
  nul failures/skips/duplicates/missing/unexpected identities. Kandidaat
  dd26352696af0295ed154868914cea13cc41f3d1e25609e9d996acc72cb9ce94,
  build/runtime/frontend/browser 233/84/220/161, root sGi00w. Iedere batch doet
  kandidaat-hercontrole voor en na uitvoering; volledige coverage-jsonregels
  en summary gecontroleerd, niet alleen een groen eindbericht. Navigatie,
  snelle invoer/zoeken, vertraagde/cancel/error-modules, auth/rollen, offline
  synchronisatie, echte isolated-ledger workflows, foto's, herstel/planning,
  privacy en bestaande axe-cases meegenomen. Geen echte operator-data gebruikt.
- Visuele inspectie zag de nieuwe locale-mobilecapture midden in drawertransitie.
  Alleen die test krijgt daarna een visibility-hidden assertion, geen UIwijziging
  en geen afgezwakte test. Laatste build 14,70 seconden; dezelfde twee cases
  opnieuw 2/2 in 11,4 seconden. Kandidaat
  7bdc984290ed212a96ef4d6af16c4a83fea99f8353dc8945a9e06a21ba2b95e6,
  root 70aDgr, groepen 233/84/220/161. Exacte vergelijking bewijst onveranderde
  build/runtime/frontend groepen en uitsluitend e2e/operator-locale-performance
  als browserverschil. Volledige audit is van voor de sterkere captureassertion,
  niet van voor een productwijziging. Definitieve desktop/mobile-PNGs bekeken:
  70aDgr/batch-001/operator-locale-performanc-3dd8a--safe-unknown-key-fallbacks-
  operator-workflows/catalog-dashboard-{desktop,mobile}.png. Geen overlay,
  appconsolefout of horizontale overflow in deze case; transport/selected axe groen.
- Volledige lint en broncontract slagen: 103 canonical, 12 retired, 17 hosted keys,
  826 bronbestanden. Read-only identity-GETs op bestaande poort 3002 vergelijken
  index.html (686 bytes), index-DZ_-Om_r.js (4803) en operator-locale-DOkPuxeq.js
  (203765) exact met dist; alle 200, nul operatorwrites. Bestaande PID 27296
  geobserveerd en onaangeroerd. UI na reload; eerdere backendfixes blijven
  afhankelijk van pending herstart, niet omzeild of als live geclaimd.
- Bewijs onder TEMP: contractor-ai-phase234-{locale-probe,locale-stable-probe,
  locale-red,focused,focused-final,focused-corrected,frontend,browser-probe,
  browser-all,browser-corrected,browser-complete,browser-screenshot-final,
  coverage-final,bundle,bundle-corrected,bundle-final,lint,contract,
  operator-assets}.log en bundle{,-corrected,-final}.json. Eerste experiment-
  audit browser-all blijft expliciet gedeeltelijk; volledige proof in
  browser-complete plus sGi00w/candidate.json/summary.json; sterkere capture in
  browser-screenshot-final plus 70aDgr. Buitenrepo coveragehelper vergelijkt
  laatste productgroepen met complete-run; geen applicatie-endpoint gemuteerd.
- A46, README, matrix, audit en verificatierapport bijgewerkt. Zeven bundlegates,
  echte apparaten/cross-browser/RAM/sustained load, pending backendherstart en
  package/EU/provider/onafhankelijke operatoracceptatie blijven open. Geen
  containers gewijzigd, geen operator-datareset, provider, commit, push of
  deployment. Geverifieerde voortgang, geen maximumperformance-/gereedverklaring.
- Laatste diffcheck en kandidaat-hercontrole na documentatie slagen; logs
  contractor-ai-phase234-diff-final.log en candidate-final.log in TEMP.
  Alle benodigde eigen execsessies zijn terminal; verse processinspectie ziet
  geen overgebleven testserver/Playwright/browserrunner uit deze werkmap. Geen
  operator-stop of opruiming van niet-eigen processen nodig of uitgevoerd.

## Phase 235 - Herstelinvoer zonder herhaalde views en verlaten reads

- Huidige prioriteit blijft maximaal resource-efficient en snel navigeren/typen;
  volledige productieopdracht niet verkleind. Geen commit/push/provider/deploy-
  autorisatie. Bestaande dirty checkout behouden. React-best-practices en
  frontend-debuggingskill, canonical runners, echte Chromium, gettermetingen en
  all-asset compressiemetingen gebruikt. Browser plugin/skill ontbreekt; normale
  Playwright-fallback, niet afwezigheid van CUA. Geen extra dependency nodig.
- Exact-duplicate CSS-probe over alle 28 geminificeerde stylesheets vindt nul
  verwijderbare regels. Eerste buitenrepo-helper faalt doordat een lokaal
  process-functienaam Node's global shadowt; visitContainer repareert de probe.
  Geen CSS-plugin, source-rewrite of veronderstelde bytewinst geimplementeerd.
- Nieuwe red fixtures: vijf cases, twee groen/drie rood in 5,84 seconden. Bij
  nieuwe-casusinvoer groeit titleReads 160 -> 2320 en caseReads 72 -> 1368;
  bronselectie 2500 identityreads; verlaten GET heeft geen AbortSignal. Exacte
  type/id en authority/time-zone/source-gedrag zijn al groen en blijven bewaakt.
- OperationalRecoveryControl hergebruikt uitsluitend huidige bronrows en
  casusviews via useMemo. Callbackidentiteiten volgen werkelijke API/job/data/
  rights/command-dependencies. Bronselecties gebruiken Map(type)->Set(id),
  zonder delimitercollisies. Huidige timezone is expliciete formatterinput en
  casusprop; geen globale formattercache, stale rechten of bewaarde besluiten.
  Alle bronlabels, bewijzen, current-source- en approvalchecks blijven bestaan.
- Effectreads delen cancellableRead en worden afgebroken bij nieuwe read of
  sluiting. Synchronous loadGeneration/refreshing guards blijven bestaan zodat
  een oude settlement een nieuwe read niet ontgrendelt. Submit krijgt geen
  abortsignal; exact pendingcommand, child-write-lock, replay en callbacks blijven
  behouden. Twee bestaande api-fixtures herkennen nu POST via method, niet via
  truthy options, zodat readsignals niet als writes gelden; exact twee retries
  expliciet asserted. Geen assertion verwijderd.
- Eerste gecorrigeerde selectie 29/29 in 18,30 seconden. Lint gaf twee echte
  extra-dependencywaarschuwingen voor timezone. Expliciete formatterparameter
  en casusprop herstellen die zonder suppressie of remount. Zesde regressie
  bewijst dat sluiten alleen GET abort en ingediende POST eenmaal doorloopt.
  Laatste selectie 30/30 in 17,84 seconden. Typingreads blijven 80/24; finale
  selectiefixture forceert een nieuwe bronarray en meet 160 reads voor 80
  bronnen/40 selecties. Eerste red fixture gebruikte authority-rerender; geen
  procentuele latency/RAM-claim uit die verschillende triggers.
- Node via canonical wrapper: 106/106, nul skips/failures, 26,066 seconden over
  tien recovery/domain/API/command/date/read/bundle/JSX/candidate/runner/release
  bestanden. Volledige Vitest: 497/497, 80 bestanden, twee workers, 125,26
  seconden. Geen nieuwe complete backend/PostgreSQL-ronde; Phase 231 historisch.
- Nieuwe browsercase gebruikt echte intake, vier veiligheidsbronregistraties
  en drie opgeslagen casussen in isolated ledger. Native fetch en oorspronkelijke
  jsonwaarden blijven intact; getters tellen alleen actuele responseproperties.
  Invoer houdt titleReads 8 -> 8, caseReads 6 -> 6, responses 1 -> 1; input en
  checkbox blijven intact. Refresh wordt vastgehouden, opdracht gesloten, native
  abort geobserveerd, opnieuw geopend: responses 2/abortedReads 2. Dezelfde drie
  casus-IDs en sourceHash blijven behouden; nul recoverywrites uit UIinvoer.
- Selected browser 24/24 in 1,9 minuten, build 13,99 seconden. Veertien dashboard-
  performancecases, nieuwe recoverycase, vijf bestaande recoverycases, catalogue,
  actual costs, lost-response replacement en work balance. Werkelijke offline
  instructie/ack/hervatting, reassessment, supplier/client/date/cost en approval-
  grenzen blijven groen. Productiekandidaat
  d9cf4dbcb8a88223e312af6d74db92ffe93dce53c10864a6031548548d9a9700,
  groepen build/runtime/frontend/browser 233/84/220/162, root tDefbx. Canonical
  runner hercontroleert candidate voor/na batch. Discovery 176; selected 24 is
  geen complete-current audit. Phase 234's volledige 175 geldt als eerder bewijs
  van voor deze productwijzigingen, niet opnieuw uitgevoerd.
- Screenshotdesktop 1440x1000 en mobile390x844 bekeken; verborgen mobiele drawer,
  panel/documentcontainment, scoped axe en appconsole groen. Bestanden:
  TEMP/contractor-ai-browser-results-tDefbx/batch-001/
  operational-recovery-perfo-3b2f5-els-only-the-abandoned-read-operator-workflows/
  recovery-performance-{desktop,mobile}.png en recovery-performance-observation.json. Waarden in
  hersteltekst blijven letterlijk, geen HTMLinjectie of synthetische APIvervanging.
- Alle 115 JS/CSS-assets geteld en sidecars exact round-trip: gzip 694403,
  Brotli 592237, +298/+337 tegenover Phase 234. Largest JS496042/CSS246349.
  RecoveryControl10747raw/4411gzip plus cancellable-read158gzip =4569; helper nu
  expliciet in recoverybudgetdependency opgenomen en contractfixture bewaakt dit.
  Case10999raw/3969gzip. Zeven originele gates nog rood: totalgzip694403/578500,
  Brotli592237/540000, clientdelivery11857/8500, recovery4569/4100, case3969/3000,
  replacement1694/1600, actions1064/900. Geen limit verhoogd/asset uitgesloten;
  CPUwinst niet als aggregate-transfer- of whole-RAMwinst voorgesteld.
- Full lint en broncontract groen:103canonical/12retired/17hostedkeys/828sources.
  Read-only identityrequests vergelijken HTML686, entry4803, catalogue203765 en
  beide recoverymodules10747/10999 byte-identiek met dist op bestaande3002; alle
  200, nul operatorwrites. PID27296/StartTime09:56:59 onaangeroerd. UI na reload;
  eerdere backendfixes blijven afhankelijk van pending herstart, geen bypass,
  tweede operatorserver, operator-datareset of publieke/providerwijziging.
- Bewijs onder TEMP: contractor-ai-phase235-{css-probe,recovery-red,
  recovery-focused,recovery-final,node,frontend,browser,bundle,lint,contract,
  operator-assets,operator-recovery-assets}.log en bundle.json. Browser root
  tDefbx/candidate.json/summary.json en screenshots/observation blijven buitenrepo.
  A47/README/matrix/audit/rapport actueel. Zeven omvangsgates, complete-current-
  browser, echte apparaten/cross-browser/RAM/load, pending backendherstart en
  package/EU/provider/onafhankelijke operatoracceptatie blijven open. Geen
  containers, deployment, providers, permissions, commit of push gewijzigd.
- Finale whitespacecheck en candidate-hercontrole na documentatie slagen:
  contractor-ai-phase235-diff-final.log en candidate-final.log. Geen benodigd
  testhandle loopt nog. Gerichte processinspectie van deze workspace ziet alleen
  de bestaande operator27296, geen eigen testserver/runner; niet-eigen processen
  in andere projecten worden ongemoeid gelaten.

## Phase 236 - Late preload-minificatie met correcte cache-identiteit

- Verifieerbare bron: de geinstalleerde Vite6.4.3-code voegt
  `__vite__mapDeps` in `buildImportAnalysisPlugin.generateBundle` toe nadat de
  normale chunk-minificatie klaar is. Terser5.51.2 is al aanwezig; geen nieuwe
  dependency. React- en frontend-debuggingskills gebruikt; de afzonderlijke
  Browserplugin/skill ontbreekt, dus de canonieke Playwrightfallback is gebruikt.
  Officiele opties: https://terser.org/docs/options/.
- Probe op reeds gebouwde bestanden: ecma2022 bespaart 969 gzip/975 Brotlibytes
  in een tweede pass. Dat is geen verse-buildwinst. De echte ecma-only build
  duurt 15,64s en groeit 3gzip/daalt72Brotli tegenover Phase235. Hoist-functions
  groeit in de probe en is afgewezen; sequences20 levert niets extra en blijft
  niet ingesteld. Geen unsafe-/property-mangling/coercion-opties toegevoegd.
- Nieuwe `preload-chunk-minifier.mjs` heroverweegt alleen ESM-appchunks met
  dynamicImports en de late helper. Alleen kleinere raw/gzip en niet-grotere
  minimum-q10/11-Brotlicode wordt gehouden. Importpaden, exports, metadata en
  filenames worden niet achteraf aangepast; debugmaps/SSR/lib/andere minifiers
  en statische chunks blijven buiten deze pass. Compilerfouten stoppen de build.
  Vite's terserOptions gebruikt ecma2022 binnen de bestaande es2022-target.
- `augmentChunkHash` legt compiler/settings/policy vast voor definitieve namen.
  Eerste cacheversieregressie reproduceert een ontbrekende encoder-identiteit:
  8/9 slagen, zlibversiewijziging behoudt onterecht dezelfde hash. Node/zlib/Brotli
  versies zijn nu mede bepalend; 9/9 slagen. Fixtures wijzigen alleen lokale
  processdescriptors en geladen package-metadata, niet node_modulesbestanden.
- Nieuwe semantische tests vergelijken echte minified modules/React-props:
  exacte publieke keys/Unicode/boolean/null, getter/coercion-volgorde,
  NaN/-0-finance, constructor/this/arity/errors, annulering en onafhankelijke
  writes. Eerste policyregressie 6/7 rood wegens ontbrekende ecma; daarna 7/7.
  Bestaande echte JSX/Vite-fixture bewijst onveranderde statische Reactbytes/namen
  bij alleen gewijzigde screencode, zonder entry-importcyclus.
- Definitieve gerichte Node-run: 115/115, twaalf bestanden, nul skips/failures,
  28,244s. Volledige componentrun: 497/497,80 bestanden,twee workers,126,88s;
  deze run ligt voor de laatste cache-only versie-identiteitscorrectie, niet voor
  een componentwijziging. Volledige lint na die correctie slaagt. Sourcecontract
  104canonical/12retired/17hosted/831sources. Actuele npm-audit: nul bekende
  advisories,451 dependencies. Geen nieuwe complete backend/PostgreSQL/loadrun.
- Voorlopige pluginbuild bespaart 446gzip/623Brotli. Die browserpoging is bewust
  onderbroken tijdens batch6-start na twintig geslaagde cases om de echte
  cacheversiefout te herstellen. Root `contractor-ai-browser-results-fONhey`,
  candidate54e7fd5c5c0b4d2e9c4e0500b84064bfec1d2fb80a8d92c349bdd73bf6e11d08;
  `browser-complete.log` is ondanks zijn naam uitsluitend gedeeltelijk bewijs.
  De eigen testservers zijn afgesloten; operator27296 is niet gestopt.
- Finale werkelijk gebouwde candidate:
  f4a335e83b1a3a636a3d2cf5e5bc375b84febfa994b2496f1696be261f4f22eb,
  groepen233build/84runtime/221frontend/162browser; build24,35s. Alle115assets:
  gzip694015/Brotli591640, besparing388/597 tegenover Phase235. Largest
  JS495201/CSS246349. Dit is een kleine transferwinst met meer bouwtijd, geen
  grote navigatie-/RAMwinst. Zeven originele grenzen blijven rood: gzip
  694015/578500,Brotli591640/540000,client11857/8500,recovery4525/4100,
  case3928/3000,replacement1695/1600,actions1042/900; geen assets uitgezonderd.
- Huidige browserobservaties gebruiken daadwerkelijke lokale responses:
  terugkeerToday298,10ms,een verlaten read, codewarming zonder ledgerreads;
  intake24tekens149,30ms,nul input-APIcalls,draft hersteld en een bevestigde job.
  ResourceTiming/Content-Length komen overeen met gekozen sidecars; dashboard
  desktop1280x720/mobile390x844 screenshots geinspecteerd, zonder overlap.
  Timing op deze machine is geen snelheidsgarantie voor andere apparaten.
- Bewijs onder TEMP: `contractor-ai-phase236-{minifier-probe,policy-red,
  staged-build,staged-build-final,cache-red,node-cache-final,frontend,
  lint-cache-final,contract-final,dependency-audit,browser-complete,
  browser-final,bundle-final}` en `contractor-ai-browser-results-jDrk1Z`.
  Finale volledige browsertest: alle176 exacte identities slagen in44/44
  geisoleerde batches, nul failures/skips/duplicates/missing/unexpected. Hetzelfde
  candidate is voor/na iedere batch en na afloop gecontroleerd. `summary.json`
  validtrue,failedBatchesempty; coverage/pass-count afzonderlijk nageteld.
- Definitief `contractor-ai-phase236-final-evidence.json` bevestigt candidate,
  alle176passes en exact onveranderde84 runtimehashes tegenover Phase235.
  Zes readonly-GETs op3002 (HTML,entry,App,catalogue,recoverycontrol/case) zijn
  status200 en byte-identiek aan huidige dist. Operatorwrites0,PID27296 nog
  gestart09:56:59; gerichte workspaceprocessinspectie vindt geen eigen
  testserver/runner meer. Niet-eigen processen blijven ongemoeid.
- Actuele recoveryobservatie: voor/na typen title8/case6,response1; na heropenen
  response2 en twee geannuleerde reads, drie behouden cases, zero writes.
  Recovery1440x1000/390x844 en catalogue1280x720/390x844 captures geinspecteerd.
  Alle4434labels/8868languageoutputs/acht onbekende keys slagen in servedcode.
  Desktop/mobile containment, scoped axe/console en alle business/browserflows
  zijn inbegrepen; geen onafhankelijke telefoon/cross-browser/provideracceptatie.
- A48/README/matrix/audit/rapport bijgewerkt. Alle zeven bestandsgroottegates,
  echte devices/cross-browser/RAM/load, pending backendherstart en
  package/EU/provider/onafhankelijke operatoracceptatie blijven open. Geen
  permissions, containers, deployment, providers, businessrecords, commit of
  push gewijzigd. Dit is geverifieerde voortgang, geen doelvoltooiing.
- Na alle documentatie: whitespacecheck, sourcecontract104/12/17/831 en
  candidate/readonly-assethercontrole slagen opnieuw. Verse volledige
  bundlemeting bevestigt ongewijzigd694015gzip/591640Brotli en zeven rode gates;
  exit1 is bewust zichtbaar, niet als een geslaagde releasecheck gerapporteerd.
  `diff-final.log`, `contract-final.log`, `final-evidence.json` en
  `bundle-final.json/.log` bewaren dit bewijs buiten de repo. Alle benodigde
  testhandles zijn afgesloten; doel blijft actief, productie niet voltooid.

## Phase 237 - 42 operatorformulieren buiten de dashboardstart

- Vorige beurt is geverifieerde voortgang, geen doelvoltooiing. Actuele bronnen
  en de 115-assetmeting wijzen App495201raw/111371gzip/87676Brotli aan als de
  grootste startdownload. Geen server-/provider-/Gitpublicatie binnen deze scope.
  React- en frontend-debuggingskills gebruikt; de afzonderlijke Browserplugin/
  skill ontbreekt en de canonieke project-Playwrightfallback is gebruikt.
- Structurele Babelinventaris vindt43 top-level modale branches. Het bestaande
  dossier blijft in App; de42 actieformulieren verhuizen mechanisch naar
  `OperatorActionDialogs.jsx`. Snapshot van de actuele, reeds dirty App onder
  TEMP `contractor-ai-phase237-source-wWxt9O/App.jsx`; geen reset/Git-historybron.
  Deep JSX-hashes voor42 templates en hun exacte parentprops worden vastgelegd
  in `tests/operator-dialog-identity.json`. Iedere oorspronkelijke conditie,
  validatie, tekst, callback en eigen binding blijft behouden; onafhankelijke
  vrije-bindingcontrole vindt geen onopgeloste variabele of importcyclus naarApp.
- State, concepten en commandohandlers blijven vanApp. Alleen componentcode wordt
  gedeeld via `loadOperatorActionDialogs`/moduleLoader en named lazycomponenten.
  Het eerste betreffende formulier haalt de hele module op; volgende formulieren
  hergebruiken deze. Geen modulecache van operatorgegevens, autorisatiebesluiten
  of commandoreplays. Intake, finance/resourceactionforms, dossier en afzonderlijke
  offline-work-packroutes blijven behouden; er is geen nieuwe API/migratie/provider.
- `DeferredActionDialog.jsx` vervangt42 dubbele laad-/foutwrappers, met precies
  de oorspronkelijke kop en sluitcallback. Laden mag worden gesloten; late code
  kan geen verborgen formulier mounten. Een mislukte download blijft lokaal bij
  het formulier en laat het dashboard/invoer staan. Opgeslagen schrijfacties zijn
  geen import-side-effect. Originele formulaireJSX blijft byte-structureel gelijk.
- Eerst drie Node-partitionregressies plus de bestaande twee finance/resource-
  contracts5/5. Eerste nieuwe componentfixtures3/5: verkeerde hourlyCost-label/
  veldnaam en verzonnen approval-assessmentshape. Fixtures corrigeren naar de
  echte hourlyRate/status/exception-evidencevelden; geen businesscode hiervoor
  aangepast. Zeven nieuwe componentchecks omvatten nu module-single-flight,
  exacte decimale invoer, callbacks/locks, requiredexceptionreason, late-module-
  close en lokale laadfout. Definitieve volledige Vitest504/504,81bestanden,
  twee workers,129,64s. Eerdere tussenrun502/502,139,76s is niet de finale run.
- Definitieve Node120/120,14bestanden,nul failures/skips,28,115s; echte compiler/
  JSX/catalogue/compression/static/date/read/candidate/runner/release plus beide
  dialogpartitioncontracts. Volledige lint slaagt. Sourcecontract106canonical/
  12retired/17hosted/837sources. Actuele npm-audit nul bekende advisories,451deps.
  Geen nieuwe volledige backend/PostgreSQL/loadronde; runtimecode is ongewijzigd.
- Eerste gerichte browserpoging: finance3/3 slagen; nieuwe3 falen omdat de test
  alleenWorkforce selecteert, niet de bestaande onderliggendeCrew directorytab.
  Werkelijke DOM/trace levert dit bewijs; alleen de testnavigatie wordt hersteld,
  geen timeout/budget verhoogd. Root `contractor-ai-browser-results-dRp4gv`
  bevat dus3pass/3fail en is geen groene audit.
- Gecorrigeerde gerichte browser6/6,20,8s opcandidate
  a061ec328dfc0921cc5287d28da869de8a5f046f90b8f3e196945f135da1b811,
  groepen237build/84runtime/223frontend/163browser; root05zHCF. Nieuwe formulier-
  module afwezig voor openen, een download na openen/heropenen,39tekens304,60ms,
  zero inputwrites en een echte retainedworkerPOST met hourlyRate42.5. Vertraagde
  en503codefoutcases blijven bruikbaar/sluitbaar zonder ledgerwrite. Desktop
  1280x720/mobile390x844 captures geinspecteerd; scopedaxe/containment/consolepass.
  Bedragen/timing zijn echte loopbackobservaties, geen liveprovider of universele
  snelheidsgarantie. Financieleactieformulieren blijven afzonderlijk deferred.
- Wrapperdeduplicatie verlaagt de eerste App376423/91007/73089 verder naar
  370910raw/90642gzip/72827Brotli:124291raw,20729gzip,14849Brotli minder danPhase236
  (respectievelijk25.10%,18.61%,16.94% voor dit bestand). Niet voor het gehele
  platform. Nieuwactionmodule146196raw/27103gzip/22472Brotli. Alle117assets blijven
  geteld en sidecars round-trip: total700498gzip/599452Brotli, groei6483/7812
  tegenoverPhase236. Coldstartup wint, totale featuresdownload/RAM niet bewezen.
  Zeven grenzen blijven rood: totalgzip700498/578500,Brotli599452/540000,
  client11855/8500,recovery4520/4100,case3929/3000,replacement1694/1600,
  actions1042/900. Geen limiet verhoogd of deferredasset verborgen.
- Finale volledige browseraudit gebruikt dezelfdecandidate en root
  `contractor-ai-browser-results-CLvHih`; build27,83s.179/179identities in45/45batches
  slagen; terminale exit0. Alle45coveragegroepen zijnvalid,179planned/discovered/
  executed,179passfooterrecords, nul failures/skips/duplicates/missing/unexpected.
  Definitieve candidatehercontrole slaagt; alle84runtimehashes zijn exactgelijk
  aanPhase236. OrigineleApp-snapshothash matcht ook het42formulierenmanifest.
- Actuele volledige-runobservatie: crew39tekens237,90ms, een moduledownload,
  zero inputwrites en een retainedPOST met42.5. Intake24tekens73,60ms, hersteld
  concept en een retainedjob; navigatie325,50ms, een obsolete readgeannuleerd en
  codewarmingzonderledgerread. Recovery behoudt8title/6case/response1bijtypen,
  na heropenenresponse2,tweeaborts,driecases,zerowrites. Alle4434catalogueentries/
  8868taaloutputs/acht onbekendekeys slagen. Nieuwe desktop1280x720/mobile390x844
  crewcaptures geinspecteerd, scopedaxe/containment/consolepass. Deze tijden zijn
  lokale observaties, geen vergelijkende of universele prestatiegarantie.
- Zeven readonlyidentityGETs op3002 matchenHTML,entry,App,catalogue,twee recovery-
  modules en nieuwOperatorActionDialogsbytevoorexact; zerooperatorbusinesswrites.
  PID27296/start09:56:59 blijft behouden; frontendherladen nodig, eerdere backend-
  fixes blijvenpendingherstart. A49/README/matrix/audit/rapport bijgewerkt.
  De eerste verkeerde CLI-rapportoptie wordt geweigerd; de correcte verse
  bundlemeting bevestigt117assets,700498gzip/599452Brotli en zeven rode gates.
  LargestCSS245833, niet de historische246349. Geen budget verhoogd of asset
  verborgen; exit1 blijft zichtbaar. Volledige lint/contract/audit/diff pass.
- Alle zeven groottegates, onafhankelijke devices/cross-browser/RAM/load en
  package/EU/provider/operatoracceptatie blijven open. Geen containers, providers,
  permissions, businessrecords, deployment, commit of push gewijzigd.
  Dit is geverifieerde voortgang, geen maximumperformance/doelvoltooiing.
- Bewijs onderTEMP `contractor-ai-phase237-{extraction,boundaries,partition,
  component-first,component-corrected,components,components-final,node,node-final,
  targeted-lint,lint,lint-final,browser-selected,browser-corrected,browser-complete,
  contract-final,dependency-audit,bundle-first,bundle-corrected,bundle-final,
  final-evidence,diff,diff-final}`.
  De vorige gedeeltelijke/rode pogingen blijven herkenbaar, niet als finaleproof.
- Na alle documentatie slagen whitespacecheck, sourcecontract106/12/17/837 en
  candidate/readonlyassethercontrole opnieuw. Alle benodigde testsessies zijn
  terminaal; workspaceinspectie vindt alleen de behouden operatorPID27296,
  geen eigen testserver/runner. Andere projecten/processen blijven ongemoeid.
  Het productiedoel blijft actief; deze performancefase sluit het niet af.

## Phase 238 - minder werk bij klantinvoer en gebundelde conceptopslag

- Phase237 is geverifieerde voortgang. Actuele bron/bundle opnieuw onderzocht;
  geheugenregistratie bevat historische Flaskinformatie, niet de huidige Node-
  architectuur. React/debuggingskills en canonieke runners gebruikt; aparte
  Browserplugin/skill ontbreekt, project-Playwright is de fallback. Geen providers,
  livebusinessrecords, deployment of Gitpublicatie binnen deze lokale scope.
- PostCSS-probe vanApp.css en daadwerkelijke gebouwdeCSS vindt nul exact
  dubbele rootregels/declaraties; geen stijl verwijderd op een vermoeden. De
  customer-response fixture reproduceert wel40->1560foto-labellezingen tijdens
  38tekens. Nieuwe gedeelde `ClientDeliveryPhotos.jsx` bewaart oorspronkelijke
  div/foto/key/labelstructuur en gebruikt standaardReact.memo perinstance.
  Fotoslijst, base, token en locale blijven expliciete props/invalidationinputs.
  Geen autorisatie- of businessdatacache; queues/leases/originallinks onveranderd.
- Vier dubbele lijsten inoffice/customer vervangen; privatebase inofficehistory
  wordt eenmaal berekend. Beide controlmodules blijven afzonderlijk. Listelement,
  ConversationPhoto, request, reader en visibility delen de bestaande getelde
  viewerchunk. Eerste partities produceren118assets met +275/+192gzip/Brotli;
  reader/visibilitycorrectie geeft +197/+99; completeclosure117assets eerst+43/-144.
  Geen van die tussenmetingen wordt voor het finale resultaat gebruikt.
- Eerste geselecteerde32componentcases slagen. Een aanvullend leasefixture leest
  voor het mount-effect nul inplaats van40registraties; wachten opde daadwerkelijke
  effectregistratie herstelt alleen de test. Token/base/locale, nieuwe arrays,
  ordening/verwijderen/legeweergave en HTML-escaping hebben aparte regressies.
  Tussenliggende volledigecomponentronde509/509 is niet de finale run.
- De klantinvoer gebruikte naast de bestaande coordinator perkeystroke direct
  `persist`/storageinventory. Eerste fake-timer/userEventfixture timedout5s,
  zowel voor als na het voorstel; dit is geen appbugproof. Deterministische
  fireEventcontrole op dezelfde oorspronkelijkehandler reproduceert61 directe
  writes bij61inputwijzigingen. Alleen `change` gaat naar `setDraft`; frozen
  sendattempts, hashes, acknowledgedphotos, onzekerereplay en succesverwijdering
  blijven direct via de originele persistfunctie bewaard. Nieuwe input produceert
  nul storagewrites/inventoryreads, pagehide schrijft1exactconcept, remount herstelt
  de velden; aparte180ms-regressie bevestigt1automatischeflush, geen vervolgwrite.
- Definitieve volledigecomponentrun511/511,83files,tweeworkers,131,00s. Finale
  Node121/121,15files,nulfailures/skips,24,884s. Volledige lint slaagt. Sourcecontract
  107canonical/12retired/17hosted/841sources. npm-audit nul bekende advisories,
  451dependencies; geen dependency toegevoegd. Geen nieuwe completebackend/
  PostgreSQL/loadronde, runtimecode is byte-ongewijzigd sinds237.
- Eerste browserselectie20/20,1,1min,candidate7d3e6b7310c71ef2d84017c5bed990e9e00882c59df7f1f316c1983cbcff87eb,
  rootLbhCkl. Deze run gaat vooraf aan de customer-draftaanpassing en sterkere
  herlaadasserties; niet alsfinaleproof gebruikt. Definitieve selectie20/20,1,1min,
  candidate950b40170e940bf423ce5f4567b1af2da823f86754810b8e6b934fe3c1eef0cb,
  root `contractor-ai-browser-results-XUqKwT`, groepen237/84/224/163. Bouw23,63s.
  Een customerworkflow, tweemediacases, veertiendashboardcases, driedialogcases.
- Servedclient56tekens houdtphoto-labelreads1->1, zeroinputAPIwrites; herladen
  herstelt naam/note/keuze/bevoegdheidscheckbox, daarna slagen echte photoPOST,
  response, onafhankelijkeapproval, export/withdrawal zonderjobclosure. Acht
  fallbackleases behouden. Largephoto:1638888bytes/12192768pixels versuspreview
  3030/691200; zeroautomaticoriginalreads en1verifieddownload. Negatieveexpired/
  revoked401/404 zijn expliciet getest. Desktop1440x1000/mobile390x844 captures
  geinspecteerd met synthetische testbeelden; scopedaxe/containment/pageerrorpass.
- Definitieve117assets700550gzip/599379Brotli, +52/-73tegenover237; geen grote
  transfersavingclaim. LargestJS370916/CSS245833; alle gebouwdeCSSbodies exactgelijk
  aan237, alleassetsha's actueel en sidecarsroundtrip. Zeven ongewijzigdegrenzen:
  gzip700550/578500,Brotli599379/540000,client11949/8500,recovery4522/4100,
  case3928/3000,replacement1694/1600,actions1042/900. Geen budgetverhoging/exclusie.
- Finale-evidencehelper telde eerst6inplaats van5JSmoduleprefixen; assertcorrectie
  controleert nu bovendien elke prefix exacteenmaal. Daarna candidate/source,
  alle84runtimehashes, CSS/assets en zeven readonlyidentityGETs op3002 slagen.
  Businesswrites opoperator0; geen herstart. Discovery179 blijft; deze fase voert
  geselecteerde20 uit, geen nieuwevolledige179. Phase237fullproof is historisch.
- A50/README/audit/rapport/matrix bijgewerkt. Actuelefullbrowser, zevenassetgates,
  onafhankelijkedevices/cross-browser/RAM/load, backendherstart en package/EU/
  provider/operatoracceptatie blijven open. Geen containers, permissions,
  businessrecords, provider, commit/push of deployment gewijzigd; doel actief.
- Bewijs onderTEMP `contractor-ai-phase238-{css-probe,component-first,
  components-selected,components-photos,components-final,draft-first,
  draft-corrected,draft-reproduced,draft-final,node-final,lint-final,contract-final,
  dependency-audit,build-first,build-corrected,build-partition,build-final,
  bundle-first,bundle-corrected,bundle-partition,bundle-final,browser-selected,
  browser-final,final-evidence}`. Rode/tussenliggende probes blijven herkenbaar.
- Na de documentatie-update opnieuw gecontroleerd: diff-whitespacecheck en
  sourcecontract slagen; finale evidencehelper bevestigt dezelfde candidate,
  20 geselecteerde browserpasses en zeven byte-identieke readonly staticresponses.
  Procescontrole toont alleen de bestaande operatorserver PID27296, gestart
  09:56:59 lokaal; geen eigen testserver of runner blijft actief. Alle benodigde
  testsessies zijn afgesloten. Geen productievoltooiing of volledige actuele
  179-browserdekking geclaimd; doel blijft actief.

## Phase 239 - retained recovery-source view, 2026-10-02

- Phase 238 is verified progress, not a wait or production completion. Current
  Node/React source and seven bundle failures were re-read before selecting the
  next change. React/debugging skills apply; separate Browser plugin/skill is
  absent, so canonical isolated Playwright is the documented fallback.
- Added deterministic regression assertions before changing product code:
  forty typed instruction characters grow forty source-title/quantity reads to
  1640 each. The old view also invokes material rendering again on an unrelated
  resolution update. Baseline has two failures and six passes, recorded in TEMP
  `contractor-ai-phase239-case-before.log`; these are reproduced input work, not
  new business-workflow failures.
- The original source-list JSX now lives inside a case-local useMemo. Its exact
  source-array reference, material-navigation callback and current-zone formatter
  are dependencies. The formatter is retained only for that current zone;
  standalone callers detect the system zone on each render. Closure/instruction
  fields, report validity, source-currentness, blockers and commands stay outside
  the view cache. No new global data cache, chunk exclusion, API or permissions.
- Nine case-performance cases include escaped refreshed titles, material
  callback/authority invalidation, explicit and detected system-zone changes.
  Focused six-file recovery suite passes 47/47 in 18.22 seconds. Existing exact
  uncertain retry, rejected-candidate correction, disabled closed/stale cases
  and source-refresh locks remain included. Current full verification follows.
- Existing live-ledger browser identity gains response-title instrumentation and
  sequential instruction input, with zero writes expected during typing; its
  original offline instruction/resumption/closure path stays intact. Adds current
  desktop capture beside its mobile capture; fixtures remain synthetic.
- Final full component suite514/514 over83files, two workers,117.72s; full lint
  passes. Canonical focused Node121/121,15files,24.531s, zero skips/failures.
  Sourcecontract107canonical/12retired/17hosted/841sources; fresh npm-audit
  zero known advisories/451dependencies. No dependency added or budget changed.
- Full current browser audit179/179 over45/45groups; final candidate
  ce7c91da95c3cbb76c8f8913f0961d2e0b832cab3d9e1ebce59c64e31a1c72e7,
  groups237/84/224/163, root `contractor-ai-browser-results-RsPOd3`. Every
  planned/discovered/executed count matches; no missing, duplicate, unexpected,
  skipped or interrupted identity. This resolves238's current-full-browser gap.
- Actual served instruction77chars keeps source-title reads2->2 with zero API
  writes while typing. Original encrypted offline read, resumption and current
  closure workflow passes, as do all replacement/supplier/client/cost cases.
  Current customer56chars still read photo labels1/1, zero APIwrites, retained
  reload recovery. Recovery desktop1440x1000/mobile390x844 images inspected:
  `contractor-operational-recovery-1790969265576-desktop.png` and
  `contractor-operational-recovery-1790969265939.png` under TEMP; synthetic records.
- Build20.97s, all117assets700608gzip/599387Brotli, +58/+8against238.
  LargestJS370916/CSS245833, CSS body hashes unchanged, all sidecars round-trip.
  Seven original limits still fail:700608/578500,599387/540000,delivery11949/8500,
  recovery4523/4100,case3981/3000,replacement1695/1600,actions1044/900.
  Scoped repeated-render work improves; no transfer or total-RAM saving claimed.
- One inline PowerShell progress helper failed because shell quoting truncated
  its JavaScript string. Replaced by a TEMP CJS evidence helper; not a product or
  test failure. Its final verification matches current candidate, all45 batch
  result files/coverage records, both typing observations, asset hashes, CSS and
  all84runtimehashes to238. Seven identity-only GETs match current served files on
  port3002. Operator businesswrites0; PID27296 remains09:56:59local, no restart.
  All own test runners/servers are terminal. No Git/provider/deployment action.
- A51/README/audit/matrix/report updated. Seven size gates, independent devices,
  cross-browser/assistive technology/RAM/load, pending backend restart and
  package/EU/provider/operator acceptance remain open. Goal remains active.
  Evidence TEMP: `contractor-ai-phase239-{case-before,recovery-selected,
  components-final,node-final,lint,contract-final,dependency-audit,browser-full,
  bundle-final,final-evidence}` plus `contractor-ai-phase239-evidence.cjs`.

## Phase 240 - bounded loaded client directory, 2026-10-02

- Continued the active production goal with the user's performance priority.
  React/debugging skills, current source and canonical local runners are used.
  Separate Browser plugin/skill is absent; regular Playwright is the fallback.
  No paid/provider/Git/deployment action or operator restart is authorized here.
- Rejected measured locale experiments; none entered product source. Standalone
  word encoding preserved 4434 labels but mostly worsened compression and added
  a decoder. Real private Vite builds counted every asset: Dutch token ordering
  saved its catalogue bytes but worsened whole gzip/Brotli by +1074/+920;
  retained-key Dutch ordering worsened them by +41/+86; per-module English
  literal pools by +4586/+3017. All three private builds terminate successfully
  with original budgets still failing. They are not production improvements.
  Their temporary plugins, outputs and measurements stay outside the repository.
- Reproduced unbounded client rendering before the fix: 101 loaded clients
  rendered 101 articles; a 500-client fixture read 500 row metrics on mounting
  instead of 25, and there was no next-page control. Three new assertions failed,
  two existing-semantics cases passed; genuine red proof in
  `contractor-ai-phase240-directory-red.log`, not a final test result.
- The loaded client directory now renders default25 / optional10/50 rows. Search
  indexes only the exact eight former fields when a nonblank search is active,
  preserving per-field matching rather than joining text or matching JSON keys.
  The mounted index invalidates for a new client-array reference; clearing search
  drops it. React's default row memo receives the exact record, locale, authority,
  busy state and live callbacks. No global/private-data cache, timeout/debounced
  input, changed API contract or automatic command is added. The existing500
  API load cap remains; this reaches all loaded clients, not every possible
  client beyond that cap.
- Extracted the existing resource ListPagination unchanged into its own module
  and reused it for clients, avoiding an import of the large resource workspace.
  Search/page-size events reset the page in the same event; smaller fresh data
  clamps it without later resurrecting an old out-of-range page. Actual shown
  count uses visible page rows. Original order and exact edit/open source objects
  remain unchanged.
- Five new component tests cover 101-client reachability, 500-client/45-character
  input, lazy index creation/reuse/release, exact field matching, changed records,
  rights/language/submitting/callbacks and shrink/empty/expand behavior. Focused
  initial components32/32 in three files pass. Full components519/519 over84
  files pass in145.67s with two workers. The final full frozen-product run below
  supersedes this initial pass after the setter simplification and CSS correction.
- The first selected browser attempt retained two successes (real-ledger client
  create/edit and all4434catalogue entries) but failed the new fixture at an
  unsupported Escape-close expectation, after input/paging/500th identity/editor
  assertions passed. The actual existing Close client editor button is now used;
  the Dutch nav assertion follows its actual ASCII apostrophe. No Escape support
  or modal behavior fix is claimed. Final current browser and quality results
  are recorded below after terminal completion.
- Populated mobile-directory axe exposed four existing low-contrast colors
  (#718079/#72817b/#7a8782/#7a8883), including a4.14:1 summary label. Corrected only
  those four scoped rules to#5d7169. A later test expectation incorrectly counted
  the explicit language PATCH as a business command; its preserved failure
  proves it was only `/api/preferences`. The final observer rejects every other
  non-read API request, verifies exact locale-only PATCH bodies, and proves no
  preference write occurs during input. All failures are retained as failures.
- Final frozen product components519/519 over84files, two workers,142.49s;
  canonical focused Node122/122 over16files, zero failure/skip,30.436s. Full
  lint and final changed-browser-file lint pass. Source contract107canonical /
  12retired /17hosted /843sources and whitespace pass. Fresh npm audit0known
  advisories/451dependencies. No new full backend/PostgreSQL/load verification.
- Final selected browser24/24, sevenfiles,1/1isolatedbatch, terminalexit0,1.5m.
  Candidate85b53f86dc74c543e85128db79769f2f531bc408dcef81e8c417fbc37535f825;
  groups239build/84runtime/225frontend/163browser revalidated. Discovery180;
  selected24 is not full180. Phase239full179 proof remains historical.
- Actual500-client read fixture: initial25articles,45sequentialcharacters;
  billing field reads0->500 once and metricreads25->25. Zero business commands.
  One explicit PATCH `{locale:'nl-NL'}` is retained separately; no preference
  write during typing. The500th identity and exact registration10000499 open
  the editor and cancel; no synthetic client is added to any ledger by this
  fixture. Ordinary client create/edit still passes on the isolated real ledger.
  Navigation/deferred-code/cancellation, shared crew paging, equipment/receipts,
  full4434catalogue labels and owner/dialog/portal accessibility also pass.
- Final desktop1440x1000/mobile390x844 first-view/footer captures inspected in
  `contractor-ai-browser-results-XvrlBR`: `client-directory-desktop.png`,
  `client-directory-mobile-top.png`, `client-directory-mobile.png`. No stable
  overlap observed; scoped axe and containment pass. An earlier mobile-top
  capture caught the nav transition; final test waits for actual hidden nav
  before capturing. Product behavior was unchanged by that test correction.
- Final build20.89s; all118JS/CSS assets701157gzip/599946Brotli, +549/+559 against
  Phase239. LargestJS370958/CSS245833. All Brotli sidecars round-trip; only
  JobWorkspaceControls CSS body changes. Seven unchanged limits fail:
  701157/578500,599946/540000,delivery11949/8500,recovery4520/4100,case3979/3000,
  replacement1693/1600,actions1040/900. No gate relaxed or shared code excluded.
  CPU-work/render bounds improve at a small transfer cost; no total-RAM or
  universal-latency/maximum-performance completion claim.
- Strict TEMP evidence helper verifies current candidate, all118asset hashes,
  exact selected pass counts/last-run, all84runtimehashes against239, CSS scope,
  current typing observation,519components/122Node/audit and seven identity-only
  staticGETs on3002. OperatorPID27296 remains09:56:59local; operatorbusinesswrites0,
  no restart/Git/provider/deployment action. Own runners/testservers terminate.
- A52/README/audit/matrix/report updated. Full current browser, seven size gates,
  independent devices/cross-browser/assistive technology/RAM/load, pending backend
  restart and package/EU/provider/operator acceptance remain open; goal active.
  TEMP evidence: `contractor-ai-phase240-{locale-probe,locale-order-probe,
  private-build,private-retained-build,english-pool-build,directory-red,
  directory-focused,directory-browser,browser-selected,browser-preference-before,
  browser-visual-before,browser-final,components-final,node-final,lint,
  contract-final,dependency-audit,bundle-final,final-evidence}` and the private
  probe/build/evidence helpers. Earlier failed/visual runs are not final proof.

### Phase 241 - Bounded qualification rows and active resource search indexes

- User priority remains maximum resource efficiency and responsive tabs/input.
  Root instructions, current Node/React sources and React/debugging skills were
  reviewed; the old memory note's Flask advice is not applied. Separate Browser
  skill/plugin is absent; canonical isolated Playwright remains the fallback.
  No Git/provider/deployment/operator-restart authority is inferred.
- A TEMP PostCSS probe compares only exact complete rule duplicates within
  matching root/media/supports contexts, excluding keyframes/layer/import and
  other unsafe contexts. It finds three App and one job-control duplicates.
  Built CSS gzip improves only 15 bytes and Brotli worsens 25 bytes. Rejected:
  no optimizer, selector/property cleanup or CSS removal ships from this probe.
- Product source changes are only ResourcesWorkspace.jsx, resource-search.js
  and App.css. Qualification workers now use existing 10/25/50 pagination, 25
  initially. Existing mounted active-search indexes reuse the exact previous
  qualification and availability JSON projections. Fallback worker arrays and
  the requirement job lookup are memoized. Default React worker-row memoization
  retains all current record/translator/rights/busy/callback props. No backend,
  approval, conflict, scheduling or provider logic changes; default 500-worker
  register cap and unpaged job requirements are explicit remaining boundaries.
- Six new QualificationPerformance cases and three additional resource-search
  cases cover last identity, index/row work, fallback/refreshed records, callback
  identity, approval/edit rights, busy state, locale, page reset/clamp/expand and
  empty results. Both indexes build 500 entries once during 45-character unit
  input. Existing resource pagination and capped-conflict safeguards pass.
- Read-only production-browser fixture replaces only the qualification GET
  response, not ledger records. Initial articles 25; 46 sequential characters
  change credential-number reads 0->500 once and approved-row reads stay 25->25.
  Worker 500 opens its exact credential editor and cancels, without saving.
  Business commands0; explicit locale-only English and Dutch preference PATCHes
  are separately retained, with no preference mutation during typing.
- New populated qualification axe first exposed existing #6e7d77 label contrast.
  A first scoped #5d7169 correction still produced4.42:1 on the green approved
  badge; final qualification-only #50645c override passes desktop/mobile axe.
  That failed 28/29 selected round is preserved, not success evidence. A later
  round passes visual/contrast/paging checks but fails its last test step because
  it keeps an English accessible search name after switching to Dutch. The
  test uses the actual Dutch name now; product behavior was not changed by that
  correction. Initial small component failures were fixture expectations, not
  claimed product regressions or proof of a green full run.
- Final frozen-product full components528/528 over85files, two workers,123.96s;
  focused canonical Node122/122 over16files, no failures/skips,27.167s. Full lint
  plus final changed browser-file lint pass. Source contract107canonical /
  12retired /17hosted /845sources and final whitespace pass. Fresh npm audit
  reports0known advisories/451dependencies. No complete backend/PostgreSQL/load
  rerun or independent production acceptance is claimed.
- Final selected Chromium29/29, tenfiles,1/1isolatedbatch, terminalexit0,1.8m.
  Candidate56926e2dd027658839d72526afc76b32b8b99912f40931fbd9c3ad7c3aee3941;
  groups239build/84runtime/225frontend/164browser revalidated. Discovery181 is
  not full181 execution; Phase239full179 is historical. Retained real-ledger
  qualification and three availability cancellation/portfolio-replacement/
  unknown-return workflows,14navigation/performance cases, client/equipment/
  receipts,4434translations/8868language outputs and accessibility also pass.
- Final desktop1440x1000 worker/footer and mobile390x844 toolbar/footer images
  inspected in `contractor-ai-browser-results-nufsBP`: qualifications-desktop,
  qualifications-mobile-top and qualifications-mobile-pages.png. No overlap
  observed; mobile navigation is hidden, paging wraps and all scoped axe/
  containment/identity/nonblank/overlay/console checks pass. These are synthetic
  record captures, not independent device, assistive-technology or user proof.
- Final build23.13s. All118JS/CSS assets701352gzip/599951Brotli, +195/+5 versus240;
  largestJS371814/CSS245894. Sidecars round-trip; only App CSS body changes. Seven
  unchanged gates fail:701352/578500,599951/540000,delivery11949/8500,recovery4523/
  4100,case3981/3000,replacement1694/1600,actions1039/900. No limit raised or shared
  dependency excluded. This improves bounded/repeated render work at a small
  transfer cost, not universal latency, total RAM or completed maximum tuning.
- Strict TEMP evidence helper validates current candidate, exact29 selected
  passes/last-run/discovery181,118asset hashes, unchanged budgets/CSS scope,
 528components/122Node/audit, exact46-character observation and three screenshots.
  All84runtime hashes equal240; product frontend differences are precisely the
  three named sources. Seven identity-only staticGETs on3002 match currentdist;
  PID27296 remains09:56:59local. Operatorbusinesswrites0; no restart/Git/provider/
  deployment action. Required runners/testservers finish before close-out.
- README/A53/audit/matrix/report updated. Full current browser, seven size gates,
  independent devices/cross-browser/assistive technology/RAM/load, backend restart
  and package/EU/provider/operator acceptance remain open; goal active.
  TEMP evidence: `contractor-ai-phase241-{css-probe,focused,browser-focused,
  browser-contrast-before,browser-locale-selector-before,browser-final,
  components-final,node-final,lint,browser-lint-final,contract-final,
  dependency-audit,bundle-final,final-evidence}` plus the CSS/evidence helpers.
  Failed browser roots NYxfax/fd5jU5/XpIPvM remain separate from finalnufsBP.

## Phase 242 - Scoped count optimization and complete backend revalidation

- Continued the resource-efficiency priority without provider/Git/deployment
  actions. One product path changes: operating-ledger.js marks the one-to-many
  request scope for DISTINCT and omits deduplication from four non-fanout count
  branches. COUNT(id), not COUNT(*), preserves legacy null-ID skipping. Scope,
  status/type/credential/ready filters, params, sums, cache and approval rules
  are unchanged; no migration, React/style source or dependency changes.
- Four new adversarial SQLite cases compare against legacy SQL and first
  reproduce unnecessary DISTINCT use. A new verified-TLS PostgreSQL contract
  checks real multi-project request fanout and count parity. Complete initial
  Node run fails ten existing checks: eight source assertions omit deferred
  forms; two custody fixtures have a passed fixed return deadline. Assertions
  retain their exact safeguards and include the actual form modules; both
  fixtures use explicit past checkout and future return timestamps. Product
  validation remains intact. Focused final64/64 passes in16.784 seconds.
- Final complete canonical Node1188/1188 over260files: isolated1070 in354.439s
  and sharedPostgreSQL118 in395.682s, no failures/skips. PostgreSQL16 fixture is
  guarded, loopback-only, verifiedTLS, bounded1GiB/2CPUs/tmpfs and removed after
  completion. Source-proof helper hashes711source/fixture files before/after:
  876d9ad1350157d1932100834e5b6f00493fef89c0f2472637a2bab53b3bfd41,
  no drift. Other containers and the operator are untouched.
- Instrumented cold-summary profile identifies avoidable DISTINCT count work.
  Controlled same retained5003-job fixture, two excluded warm-ups,20samples per
  variant in alternatingAB/BA order: medians567.4874 ->459.7409ms (-18.9866%),
  p95642.81 ->534.1537ms. Full summaries match except generated timestamps;
  measured loop sends zero business commands. No general latency/RAM claim.
- Independent fresh production profile passes every unchanged threshold on
  5000jobs/20000tasks/25000audit events. Coldp95594.76ms versus earlier509.13;
  warm0.29/protected2.05/intake38.43/audit231.81ms, DB38.49MiB, RSSgrowth165.57MiB.
  These separate profiles are not causal before/after speedup evidence. Synthetic
  TEMP fixtures are retained separately; the operator ledger is never copied.
- Private fallback-dictionary build probe grows aggregategzip4712/Brotli3214
  bytes and is rejected. Quality11 Brotli mode/size-hint/window probes on eight
  large assets round-trip but savezero; none ship or add dependencies.
- Fresh current Chromium38/38 in13files,1/1batch,exit0,3.2m: retained29cases
  plus rapidintake, cursoraudit, archive/restore, exactautomation and five
  recovery workflows. Candidate55fcf3524f44b6df02887919113446b1408f5c95a549ef38b7ff1125f92fba05,
  groups239/84/225/164 revalidated. All239built hashes equal241; each source
  inventory changes onlyoperating-ledger.js. Discovery181 is not full181.
  Prior fullcomponents528/85 remains historical, not a new rerun; no direct
  operating-ledger imports exist in frontend-tests. Current qualification
  fixture retains25rows/46characters/500search reads/25unchanged approved reads,
  exactlastworker500editor/cancel and zero business commands.
- Current desktop1440x1000 worker/footer and mobile390x844 toolbar/footer
  qualification captures retain containment/axe/no-overlap proof. Build24.53s;
  all118assets remain701352gzip/599951Brotli, largestJS371814/CSS245894, sidecars
  round-trip. Seven original size gates still fail; no limits raised or excluded
  shared dependencies. Full lint, source107/12/17/846, whitespace and audit0/451
  pass. Strict evidence rechecks current Node sourceproof, candidate,38selected
  passes, benchmark/AB/asset hashes and seven identity-only staticGETs on3002.
- README/A54/audit/matrix/report/benchmark docs updated. PID27296 still starts
  09:56:59local; no restart or operator business writes. New backend code is not
  active in that older process. Fullcurrentbrowser/device/load/RAM, seven size
  gates, restart and package/EU/provider/operator acceptance remain open; goal
  active. TEMPphase242 logs/reports/helpers and browser-results-SjclRX preserve
  evidence; initial failed Node run and rejected compiler probes are not passes.

## Phase 243 - Static-graph preload filtering with cache-safe identities

- Continued resource-efficiency work using installed React/debugging skills and
  canonical runners. Browser plugin not available; regular Playwright is the
  documented fallback. No provider/Git/deployment action or operator restart.
- Two product paths: loaded-preload-filter.mjs and its vite.config.js entry.
  Build-only filtering uses exact transitive static chunk imports, handles
  cycles and retains the live graph after Vite removes pure-CSS chunks. Dynamic
  edges, new/shared children, CSS/assets, unknown paths and HTML lists remain.
  Custom/disabled policies, debug/alternative minification, SSR, libraries and
  non-ES output bypass the optimization; no runtime dependency is added.
- Private initial graph probe omits380references across86callbacks and reduces
  total bytes, but does not salt late dependency-map changes before filenames.
  It is never shipped. A salted follow-up still reduces gzip431/Brotli312 bytes.
  Product policy includes installedViteversion and serialized implementation
  identity in augmentChunkHash before final names. References omitted are not
  a count of proven extra network downloads.
- Eight new Node tests cover exact/transitive/cyclic graph, dynamic/new/CSS/unknown
  paths, live removals, output/watch reset, guards and compiler identity. Three
  real Vite fixtures preserve child code/exports/CSS/new dependencies and repeat
  enabled output; changed hashed assets cannot reuse names. First test run39/40
  fails an over-strict comparison of mutable index.html; the assertion is scoped
  to immutable hashed JS/CSS and additionally checks changed entry names. Final
  direct40/40 and canonical132/132 over17files pass, no failures/skips,31.854s.
- Fresh full components528/528 across85files, two workers,159.00s, terminal0.
  No React/style source changes. Current Chromium44/44 in18selectedfiles,
  one isolated batch,3.9m,terminal0. Candidate
  c9aada9924b653e61e9d5b872ea41c1d30dc566406ff18001c17fb0f2f2783a9,
  groups239build/84runtime/226root-component/164browser-closure revalidated.
  All84runtime and164browser hashes equalPhase242; product inventory changes
  onlythetwo named build paths. Discovery181 is not full181 execution; prior
  complete backend1188/PostgreSQL and controlled19%count proof remain historical.
- Cold/warm navigation, rapid input, cancelled/failed forms, translations,
  recovery, qualifications, client/field/company encrypted offline reentry/sync,
  protected photos and hash-verified original download pass. Browser transport
  body/content-length/resource timing matches actual Brotli sidecars. Inspected
  1280x720desktop/390x844mobile dashboard captures show no overlap; identity,
  nonblank/overlay/console, scopedaxe and containment checks pass.
- Build23.86s; all118JS/CSS assets count, shared dependencies retained. Gzip
  701352->700819 (-533), Brotli599951->599521 (-430), largestJS370088/CSS245894.
  AllCSS bodies unchanged; retained hashed filenames have identical bytes.
  Seven original gates still fail: gzip700819/578500,Brotli599521/540000,
  delivery11949/8500,recovery4495/4100,case3957/3000,replacement1694/1600,
  actions1018/900. No limit increase or feature omission; no general latency,
  whole-browser RAM or completed maximum-tuning claim.
- Full lint, sourcecontract107/12/17/848, whitespace and freshaudit0/451 pass.
  One invalid budget CLI argument is retained separately, then corrected to
  --report; the real final CLI still exits1 for the seven unchanged limits.
  Strict TEMP helper verifies candidate,132Node/44browser/528components,
  allasset identities/cache/CSS/budgets, observed transport and seven public
  identity-only GETs matching currentdist on3002. Operatorbusinesswrites0;
  PID27296 remains09:56:59local, olderbackend still active. Owned runners finish.
- README/A55/audit/matrix/report/benchmark updated. Fullcurrentbrowser/device/
  RAM/load, seven size gates, olderbackend restart and package/EU/provider/operator
  acceptance remain open; productiongoalactive. TEMPphase243 compiler/probe/node/
  browser/component/lint/contract/audit/budget/evidence files and browser root
  contractor-ai-browser-results-xIpH0T retain proof separately from failed probes.

## Phase 244 - Indexed loading reads and explicit environment blockers, 2026-10-03

- Replaced loading recommendation join fanout with independent counts and indexed
  existence checks; migration096 adds tool/material job/status/ID indexes without
  rewriting records. Scope, statuses, null IDs and LIMIT5 preserved; ties use ID ASC.
- Shared SQLite/PostgreSQL contract and SQLite nullable/query-plan tests cover the
  actual statement, nextActions, high fanout, exclusions, migration095 upgrade and
  idempotent reopen. Mechanically advanced97 schema-head assertions in64 files;
  retained historical095 fixture and added096 to packaged readiness list.
- Initial private copied5,003-job SQL prototype, 12 jobs with100tools/100materials/
  3plans each, same indexes and20 samples each: dashboard median780.68->463.76ms,
  complete summaries equal except generated timestamps; index growth147456B.
  Not a universal speed/RAM claim. Later D: built-statement probe supplies no timing.
- C: reaches0 free bytes; broad verified-TLS/Node run fails SQLite writes and loses
  final proof. Owned C: probe cleanup is policy-denied, no deletion workaround.
  D: exFAT repeat has4 link-fixture EISDIR failures before assertions, then stopped.
  Slow D: production benchmark and probe stopped; no full-suite/build claims.
- Current focused Node15/15,14.357s,zero skips/failures,716 frozen sources; full lint,
  whitespace, releasecontract107/12/17/851 and fresh audit0/451 pass. Chromium15/15,
  48.3s, exact coverage, candidatef86daf93ec5eb32697b40ec09773c74e1e67e3af267cb798980977c48c88d3cb,
  reused unchanged previous dist against new backend. Desktop/mobile captures
  inspected, navigation/input/cancellation/search and compressed transport pass.
- All118 unchanged assets count; gzip700819/Brotli599521,7 original gates fail.
  Operator27296 remains09:56:59local/Oct2, older3002backend not restarted; no operator
  writes, Git/provider/deployment action. Test runners finished/stopped; Docker
  inventory unconfirmed after read hung. D:Contractor-AI-QA-phase244-mlNuU6 retains
  accepted evidence separately from failed/stopped runs. Current docs/A56/matrix
  updated; free C: and rerun full NTFS/PostgreSQL/build/package acceptance. Goal active.
