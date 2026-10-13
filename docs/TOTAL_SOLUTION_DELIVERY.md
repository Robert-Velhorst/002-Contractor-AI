# Contractor.AI Total-Solution Delivery

Accepted scope, implementation evidence and remaining work. This is a delivery
register, not a claim that all these capabilities already exist. Existing local
features remain authoritative only to the extent supported by code and tests.

Recent implementation increments: [Work Balance](WORK_BALANCE.md), migration
082, connects approved production to packages, execution, partial delivery and
position eligibility; unknown-return availability adds an explicit operational
follow-up without releasing future capacity. The operational-recovery view now
joins one worker absence to the affected assignments across the company and
offers one existing-ledger replacement plan with independent approval. See the
acceptance evidence at the end of this register. These increments do not
complete resource-feasible planning or the total-solution scope.

The 2026-09-26 integrated recovery scenario now proves one job can carry worker
absence, material shortfall, an accepted contractual date, and source-attributed
actual cost through independent replacement approval, material receipt,
explicit reassessment, client-date review, and evidence-backed case closure.
It also corrected historical availability lookup after replacement. This is
local integration evidence, not live provider, hosted PostgreSQL, or field-site
acceptance.

Unsubmitted actual-cost attribution inputs in the recovery review are now
restored for the same operator and source-bound recovery version, like the
existing cost-review form. A source change receives a different draft scope;
the selected cost post, amount and rationale are not silently reused against it.

## Source-Bound Browser Verification

The standard browser runner now hashes all served files, the union of packaged
runtime closures (including packaged documents), root/component application sources and browser test sources
after one build. Every group checks the candidate before and after execution.
Changed, missing, added or linked files stop verification; empty groups cannot
count as successful coverage. Artifacts stay outside the repository, while
temporary test databases are cleaned after each group.

The Playwright child also inherits only explicitly allowed platform/browser
settings. Local loopback SQLite/filesystem mode is enforced and scheduler, AI,
WhatsApp and live weather are disabled. Operator credentials, hosted storage,
shared identity, private paths and Node preload settings are not passed down.
This is test-environment protection, not a network sandbox or provider proof.
Current results and remaining release gates are recorded in
`FINAL_VERIFICATION_REPORT.md`; the total-solution scope is not redefined around
these checks.

## Bounded Offline Document Downloads

Drawings, safety sheets and approved technical PDFs now share one verification
path and an approved-size byte buffer. Stream failures unlock their reader;
incorrect types, signatures, sizes and hashes fail closed. The online worker
pack loads verification and encryption only on demand, while the offline shell
still installs the required modules. Saving prevents duplicate submissions and
freezes the passphrase; live source changes or failed downloads prevent retention.
The existing role/company/source boundaries and document limits remain intact.

The production-bundle browser test retains and approves real PDFs of all three
kinds, verifies individual online downloads, then opens the encrypted folder
offline and compares every downloaded byte. It synchronizes one retained
question once and checks expiry. Twelve targeted browser identities pass with
valid coverage; the full component suite passes 287/287 and focused Node checks
43/43. This is local robustness/loading proof, not total-solution completion,
aggregate download reduction, hosted acceptance or independent site testing.

## Interrupted Replacement Recovery

The job recovery replacement form now locks both the selected worker and the
reason during a write. An uncertain response retains the exact command in the
existing source- and operator-scoped session draft. Retrying reuses that command;
a confirmed rejection releases it for correction while retaining the input.
The browser test lets the real server retain the plan before deliberately
discarding the response, then proves the retry leaves exactly one pending plan
and does not change the original assignment. Reload confirms the retained
approval is visible. Closed, cancelled and source-stale cases cannot initiate
replacement or other child impact actions; read-only history remains visible.
This is connection-failure recovery, not independent approval, automatic
reassignment, external communication or release acceptance.

## Customer Request to Reviewed Portal Choice

Current inbound conversation findings can be converted into a private customer
choice draft. An office operator supplies the final question, two to ten
distinct answer options, a future response date and an internal rationale. The
approval review presents the exact choices alongside the source message and
analysis context. It remains hidden from the client until a separate approval
revalidates the source conversation and analysis. Approval only publishes the
choice in the token-scoped client portal; it does not send a WhatsApp message,
capture agreement, or change scope, price, schedule, orders or work authority.
Rejected and stale proposals remain hidden. Customer replies continue through
the separate approval-backed client-response workflow.

## Early Shift Check-In Exception

After a valid, integrity-checked and released start huddle, the office action
queue checks each listed active assignment with a retained start/end window.
If the assignment began at least 30 minutes ago, is still within its window,
and has no attendance session, the queue presents a high-priority check-in
review linked to that exact job, worker, assignment and huddle snapshot. A
recorded check-in or check-out removes the action. The wording asks the office
to confirm the situation and explicitly does not infer absence or sickness.
Blocked/invalid huddles, unassigned roster members, planned or pending-approval
assignments, future/ended windows and stale snapshot hashes do not generate it. This
is a local, derived internal signal; it sends no notification, changes no
assignment and cannot distinguish an unrecorded or offline check-in from a
missed start until evidence reaches the ledger.

From that exact source-bound action, an owner or office operator may record
unavailability only after independently checking with the worker or site lead.
The API re-derives the warning and requires its current source hash; a new
check-in, changed huddle, changed assignment, or stale action prevents the
write. The resulting availability period covers only that assignment's retained
shift and records its source fingerprint, not a medical or family reason. It
removes the missing-check-in warning and feeds existing assignment-conflict and
opt-in standby replacement workflows. Replays do not duplicate the period; no
worker is automatically removed or replaced, and no customer/provider message
is sent. The original assignment remains until the separate approved
replacement flow resolves.

## Product Decisions

- Cover repairs, emergency/service work, maintenance, renovations, newbuild,
  installations and specialist work. Do not redefine completion around one trade.
- Support employees, independents, subcontractor companies, foremen and supervised
  apprentices. A person, company membership, contract and admission are distinct.
- Separate contractor business environments, not a shared public job marketplace.
  A worker may explicitly join multiple companies without exposing their dossiers.
- Three connected experiences: office decisions, mobile work packs, client chat
  with private photos and source-linked analysis.
- Local first, followed by EU hosting. One authoritative write environment per
  company, either local or hosted; offline clients retain snapshots and commands.
- Bounded external execution is part of the scope, with verified integrations,
  explicit mandates, recipient/product limits, budget reservations and a stop
  control. Payments always require individual approval.
- The first purchasing integration is a business-email purchase order. A sent
  message is not supplier acceptance or goods receipt. WhatsApp requires actual
  business-account verification; the previously supplied private number is not
  assumed to be an activated business sender.

## Architecture

Keep Node/Express, React and the operating ledger as the canonical application.
Each company has its own runtime, database, private storage credentials and jobs:
SQLite locally, a separate PostgreSQL database and private object scope hosted.
An optional separate platform registry holds identities and company memberships,
not job dossiers. Shared identity uses OIDC with controlled account linking,
persistent sessions and revocation; matching email addresses never auto-merge
accounts. The current contract is in [Identity and Membership](IDENTITY_AND_MEMBERSHIP.md).

Keep task dependency graphs. Resource planning will run outside the API process
using the official Z3 Node/WASM solver, with bounded computation, explicit
infeasibility versus timeout and revalidation before application. The existing
elapsed-hours calculator is not evidence of a resource-feasible calendar plan.

The resource-feasible preview preserves every active task's complete, in-window
schedule by default. If a scheduled slot conflicts with current capacity,
availability, qualification, material readiness, dependencies or a retained
site-access calendar, the proposal must fail rather than silently move the
commitment. Site calendars are source-noted and timezone-aware; travel still
requires verified route-duration data before it can constrain the solver.

## Delivery Register

| Phase | Required result | Current delivery state |
| --- | --- | --- |
| 1. Preserve and baseline | Recoverable current code/data; requirement-to-test record | Local source/database/uploads checkpoint created 2026-09-12; SQLite integrity passed. Not encrypted or a signed release backup. |
| 2. Company boundaries | Runtime/database/storage isolation; identity, memberships, invite/admission/recovery/revocation; scoped files, jobs, AI, search, exports and offline caches | Boundary foundation plus optional shared registry, OIDC, invitations, separate admission, worker linking, recovery codes and company switcher implemented and locally tested. Registry recovery/key rotation and the governed local-to-hosted handover have tested commands. Authority-aware disaster recovery, registry origin rebinding, guided offline recovery and wider hosted acceptance remain. |
| 3. Shared work model | Parties, buildings/rooms/assets, jobs, packages, tasks, positions, quantities, partial completion and separate closure states | Migrations 077-081 add physical hierarchy, parties, packages, partial output, installed-asset history, reviewed inspection coverage and direct scoped client responses with office verification. Office, client conversation, field/offline, recurring preparation and backup/transfer paths are connected. Strong recipient identity/signatures, commissioning/safe-use release, remaining-scope planning and final contractual closure remain. |
| 4. All work types | Versioned profiles, surveys, quantities, rates, offers, choices, preparation and positions; sourced AI proposals | Existing domains require profile coverage and end-to-end integration. |
| 5. Workforce and planning | Recurrence, conditional availability, unknown return, travel, crews, supervision, waitlist, cancellation/replacement; interest/offer/confirmation/start permission distinct | A bounded Z3 preview sequences linked tasks over recorded assignment windows, explicit trades/qualifications, availability, other-job blocks, material readiness, finish-to-start dependencies, worker day/shift calendars and verified recurring site-access windows. Complete existing task schedules and their approved crew membership are locked in previews and revalidated on approval; conflicts fail closed instead of shifting commitments. Tasks can require up to twelve qualified workers across up to eight explicit trade groups, reserved concurrently for the same task window; every retained crew member receives the task, their role, and their own start-release checks in the scoped field pack. Availability, qualification, two-week capacity, unknown-return follow-up and cross-job absence replacement controls exist. Standby availability now retains a worker-set minimum notice and replacement call-outs are source-checked against it through acceptance and independent approval. Revision-bound expiring offers require an explicit worker response on held-interest and waitlist routes; ordinary ready self-enrollment accepts the published terms and creates an internal planned assignment directly after authoritative checks. Human supervisor start releases are audit-chained per assignment with current-source, planning, qualification, permit/plan, worker-acknowledgment and positive-LMRA gates; the assigned worker confirms receipt and can stop/decline. Position-level start-release policy is retained with exact linked tasks and enforced server-side on `in_progress` reports; changed source, expiry or revoked release blocks the report while blocker reports remain available. Tasks can name multiple role-matched supervisors and set an explicit workers-per-supervisor ratio. Planning derives the minimum supervisory headcount, verifies every selected supervisor's job assignment, qualification and full task-window availability, and reserves each once alongside the crew; field start release checks that the required number are on site. This is a configurable operational control, not a built-in legal ratio. A joint portfolio planner now optimizes up to eight selected jobs and 48 active tasks against a shared crew pool, preserving selected-task schedule locks, outside-job assignments, qualification, material, availability and dependency constraints. Directional travel between selected sites must be sourced and current; the combined proposal is source-hashed and applied only after one independent approval revalidates every job, atomically. Universal offers across all enrollment paths, broader conditional availability and recurrence remain. Portfolio-scale optimization beyond these limits and hosted PostgreSQL parity remain unverified. |
| 6. Readiness and exceptions | Combined cross-job/resource impact, owned escalation, feasible alternatives, near-term stability and verified resolution | Absence and material-shortfall impacts join against linked tasks; field blockers feed owned recovery cases; same-absence assignment replacements across jobs can be proposed as one independently approved plan. For a short delivery linked to a purchase order, office can retain an evidence-referenced supplier follow-up, a supplier-stated date or a next-contact date. A source-backed expected material date is compared per linked task against its start in the current approved baseline; missing/stale comparisons remain unknown and never rewrite a schedule. For an absence, the case surfaces approved site visits assigned to that worker during the absent period and source-bound customer follow-up. Case closure now verifies linked field-task resumption, zero material shortfall, closed safety incidents, absence conflicts and current customer/contract impact review, retaining the checked source versions in the audit. These remain internal controls: they contact neither party, alter no dates/orders, and do not perform external follow-up. End-to-end resolution across every disruption type and provider-backed follow-up remain incomplete. |
| 7. Three experiences | Office workbench, worker communication and offline conflicts/recovery, client photo chat, tested Android package | Office, field and client surfaces and encrypted offline work-pack flows exist; field cache is now scoped to its route dependency graph. Local client analysis can run through an opt-in durable leased queue with bounded retries and source revalidation. Current customer questions, requests, issues and contradictions can become assigned source-linked RFIs; current approved RFI answers can return as private source-bound chat drafts. Approved, client-visible field reports can also seed editable private customer-chat drafts; report and portal access are revalidated at message approval and publication. Native Android and web field screens poll the assigned worker's approved-answer feed while open, with no background push. Online and Android field packs distinguish a task's assigned worker from its named supervisor; supervisors can read the supervised task but cannot report progress for another worker. Wider cross-experience handoff, native compilation and independent device acceptance remain. |
| 8. Mandates and dispatch | Durable outbox, reservations, source-version checks, revocation, receipts and unknown-outcome recovery; email purchasing first | General external mandates and email purchase-order adapter remain. |
| 9. Commercial closure | Variations, quality, handover, invoice/payment evidence, warranties, maintenance, installed history, abandoned jobs and temporary works | Existing finance/quality modules require full-chain validation. |
| 10. Release and hosting | All roles/work types/scenarios; local and PostgreSQL contracts; package/container/restore proof; EU deployment acceptance | Not complete. Existing Hetzner deployment needs current OS access, capacity and recovery verification; preserve the other hosted application. |

Current increment: the field work pack now presents identity-safe dispatch
readiness and supports an audit-chained human start release per worker/shift.
Owner/approver issue is gated by current planning, qualifications, linked safety
plans/permits, worker acknowledgments and positive on-site LMRA; the worker must
confirm receipt and can decline/stop. Changed source/readiness and expiry fail
closed. A published position can now require that release for its linked tasks;
the server enforces it on in-progress field reports while preserving blocker
reporting. This online control does not replace statutory permits or site-
specific judgment. Site-/work-type policy configuration, complete work-type
coverage and live operator acceptance remain open.

## Non-Negotiable Domain Rules

- Customer, property owner, resident, payer and authorized decision maker may differ.
- Physical completion, inspection, customer acceptance and payment are independent.
- Work packs retain outcome, quantities, dependencies, qualifications, crew,
  materials/equipment, current instructions, safe stop/transfer points and checks.
- Availability records operational windows and voluntarily supplied conditions,
  not medical diagnoses, family details or hidden punishment scores.
- Ordered, supplier-confirmed, received, inspected, reserved, on-site, consumed,
  damaged and returned materials are distinct. Include units, waste and packaging.
- Every exception has a source, owner, deadline and escalation path. Resolution
  includes updated instructions, affected-party acknowledgments and verification.
- Never double-book a person, crew, workspace, tool or stock reservation while
  resolving concurrent incidents. Cross-company free/busy is minimal and opt-in;
  loss of its reservation service prevents confirmation, not draft preparation.
- Preserve near-term commitments; do not continuously reshuffle accepted work.
- AI proposals retain source/version and uncertainty. Documents are data, not
  instructions. AI does not grant safety clearance or invent client acceptance.
- Offline work is a retained copy, not an independent authority. Conflicts and
  uncertain external outcomes remain visible; no blind retry of a possible order.
- External changes to terms, substitutions, budget overrun, disputed inputs or
  safety require a human decision. New automation defaults to disabled.

## Acceptance Matrix

| Area | Required proof |
| --- | --- |
| Isolation | Two companies with overlapping record IDs and a shared person; no leakage through API, files, sessions, search/AI, jobs, exports, backups, offline work or cache. |
| Lifecycle | Normal path, interruption, recovery, handover and closure for every work type and role. |
| Workforce | Unknown return, conditional care availability, concurrent claims, supervisor absence, partial completion and replacement acceptance. |
| Resources | Shortage, wrong delivery, stale drawing, customer change and combined cross-project conflicts. |
| Autonomy | Revocation before/during dispatch, concurrent budgets, duplicate messages, timeouts, crashes between reservation and commit, stop and provider reconciliation. |
| Recovery | Versioned local migrations, exported-fixture restore, SQLite/PostgreSQL parity, no revived sessions or external actions. |
| Experience | Desktop/mobile real browser workflows, offline account/company mismatch and conflict recovery; native build and device checks separate. |
| Delivery | Lint, Node, frontend, production build, browser, container, performance and Windows packaging; environment skips never count as passing. |
| Providers | Local mail-server tests separate from real delivery/acceptance; no claimed live AI, Meta, accounting or bank connection without proof. |

The first integrated disruption scenario is worker absence plus missing material
plus a client commitment, through approved recovery and retained costs. Passing
that scenario alone does not complete the total solution.

## 2026-09-26 - Integrated absence, material, client-date and cost recovery

The combined acceptance workflow now carries one recovery case across an
approved worker replacement, accepted material replenishment, the existing
accepted-quote client-date commitment, and approved actual project expense.
Replacement and replenishment make the case source-stale; the operator must
reassess the case and record a current client-date impact review before closure.
The approved expense remains source-attributed to the case, with a separate
cost-impact review. Closing the case stores the current resolution review and
cost attribution without sending customer/supplier communication or creating
external commitments.

The scenario exposed and fixed a historical-source lookup using the retired
`worker_assignments` table after replacement. Recovery now links availability
history through the canonical `assignments` ledger and covers the no-longer-
active source path.

| Gate | Verified result |
| --- | --- |
| Domain/API | One isolated SQLite-ledger scenario covers accepted scope, quote/risk approvals, accepted contract date, absence, shortage, independent assignment replacement, additional accepted receipt, stale-case reassessment, date-impact review, approved actual-cost attribution, cost review and evidence-backed closure. |
| Regression | The historical availability source remains readable after replacement; unresolved worker/material/client-date blockers prevent closure, and the final retained case records the reviewer, zero material shortfall, live client review, and 6,000 EUR-cents attributed to the actual expense. |
| Focused Node | Operational recovery, recovery command plan/API, workforce availability, client-date commitments and actual-cost suites passed (48/48). |
| Interface | Operational recovery/cost/portfolio React suites passed (22/22). |
| Browser | Isolated production-bundle recovery workflows passed (5/5), including the combined office-dashboard scenario, mobile encrypted offline instructions, coordinated replacement, supplier response and absent-worker client appointment review. The combined journey verifies source reassessment, accepted replenishment, current contractual date review, approved actual-cost attribution, evidenced closure, mobile width and axe checks. |
| Remaining boundary | Hosted PostgreSQL parity, live communications, real supplier/customer agreement and independent site acceptance remain unverified. |

## 2026-09-12 Boundary Increment

The implementation contract and operator caveats are in
[Company Environment Boundaries](COMPANY_ENVIRONMENTS.md). This increment keeps
the existing ledger and three interfaces, without deleting operator data or
activating providers. The broader browser audit also fixed compressed financial
details, low-contrast descriptions and mobile action-column overflow in production
and task dependencies. Failed product-module loading now shows an accessible
recovery screen with manual reload instead of an empty application. It does not
clear retained browser storage or automatically replay the interrupted action;
unsaved form input is not claimed to be recoverable.

| Evidence | Verified result |
| --- | --- |
| Source/data checkpoint | `tmp/build-checkpoints/2026-09-12T12-46-55-404Z/`; checksummed source, consistent SQLite snapshot, operator-readable export and uploads. Local and unencrypted, not a signed release backup. |
| Existing-data migration | Fresh copy of checkpoint database, source SHA-256 `0894046de72f867de7f64369fad3e500d17d68de4b11625886e845faf55b6161`; migration 074, integrity `ok`, all 156 prior business tables unchanged. |
| Node local suite | 624 discovered: 587 passed, 37 PostgreSQL-dependent skips. `tmp/total-solution-node-accepted.log`. Skips are not counted as passes. |
| PostgreSQL | 57 tests passed with no skips using a disposable PostgreSQL 17 service, TLS 1.3 and `sslmode=verify-full`. After migration-scope hardening, all 26 tests in the migration/startup/operations subset passed again, including the new company-startup case. Object storage uses test doubles, not a live EU provider. |
| Frontend | 36 component tests passed across 11 files. `tmp/total-solution-frontend-accepted.log`. |
| Browser | All 113 unique Chromium workflows have a passing execution across isolated batches and targeted reruns, not one uninterrupted clean run. Final recovery/production/planning checks passed in `tmp/total-solution-recovery-final.log`; all seven office/field/client/offline boundary checks passed again in `tmp/total-solution-role-accepted.log`. Earlier failed logs remain available. |
| Performance | Production-profile fixture: 5,000 jobs, 20,000 tasks, 2,500 opportunities and 25,000 chained audit events; all configured thresholds passed. `tmp/total-solution-benchmark.json`. |
| Delivery | Release contract, HAI fail-closed contract, lint, production build and bundle budget passed. Final delivery unit checks: 13 passed in `tmp/total-solution-delivery-tests.log`. Bundle: 507,197 gzip bytes against the 510,000-byte limit. |
| Container | Final production build/start/restart/shutdown passed with non-root, read-only filesystem, loopback exposure, authenticated sessions and persistent SQLite volume. Migration 074. `tmp/total-solution-container-accepted.log`. Test container, volume and image cleaned afterward; not EU deployment acceptance. |
| Windows | Package rebuilt under `release/ContractorAI-windows-x64` using Node 22.23.2. Real packaged startup passed migration 074, zero pending migrations, company-bound session/directories and wrong-company download refusal. `tmp/total-solution-windows-accepted.log`. HAI publication is a local fixture; the ngrok lifecycle uses a test double, not a live tunnel. |
| Operator environment | All 157 original tables still match the pre-edit checkpoint before preview startup, including migration history. `tmp/total-solution-original-before-preview.json`. Automatic preview startup was denied by the execution policy, so the existing operator database was not migrated and no preview is claimed to be running. |

The browser audit corrected stale selectors, native-download expectations,
language-dependent test setup and a fixed planning date that had fallen outside
the live look-ahead window. One transient Chromium `ERR_NO_BUFFER_SPACE` exposed
the missing product error boundary; explicit failed-module/reload coverage now
passes, including mobile accessibility and retained browser storage.

This is not completion of phase 2 or of the total solution. The next implementation
boundary is the small identity/company registry with controlled membership and
recovery, followed by the shared work model and resource-feasible disruption flow.
Live provider, native phone and EU deployment acceptance remain separate gates.

## 2026-09-12 Identity Increment

Personal accounts now have separate, reviewed memberships in each company. The
optional registry has its own SQLite/PostgreSQL database, origin, encrypted
provider records and hash-chained admission history. A company is entered through
real OIDC authorization code flow with PKCE, state and nonce, not by copying an
owner key. Online requests recheck current membership; recovery and revocation
invalidate access. Matching email addresses never merge people or worker records.

Office controls create and revoke one-time invitations, review membership versions
and explicitly retire a selected legacy worker login when linking it. The worker's
account ID and applications remain. The phone interface supports personal sign-in
and company switching. Client portal access is unchanged. Registry loss blocks
online SSO, while an independently configured owner recovery key still works.

Migration 075 retains existing board accounts and adds encrypted company OIDC
flows/sessions. Local restore and hosted migration clear those sessions and flows;
recovered accounts remain under existing suspension rules. The optional registry
is not included in a company's backup. Its disaster recovery needs a separate,
rollback-safe procedure before production activation.

| Evidence | Verified result |
| --- | --- |
| Source checkpoint | `tmp/identity-checkpoint-20260912-163945/` retained the pre-identity source tree. Existing operator data was not reset. |
| Node | Full local run: 634 discovered, 596 passed, 38 PostgreSQL-dependent skips, no failures. `tmp/identity-node-final.log`. After the final registry database/client-identifier guards, all 19 focused identity/API/delivery tests passed again in `tmp/identity-regression-final.log`. Skips are not passes. |
| PostgreSQL | 40 registry, company, migration and ledger contract tests passed with no skips on disposable PostgreSQL 17 using verified TLS. `tmp/identity-postgres-accepted.log`. The registry contract passed again after final hardening with TLS 1.3 and an authorized certificate in `tmp/identity-postgres-final.log`. This is not live EU-provider acceptance. |
| Frontend | 39 tests passed across 12 files. `tmp/identity-frontend-final.log`. Includes one-time recovery-code handling, no blind invitation retry and prevention of a stale legacy-session race during SSO startup. |
| Browser | Nine Chromium workflows passed in one run: new identity/admission/recovery, legacy worker/owner flows, operator sessions, field packs and company-offline separation. `tmp/identity-browser-accepted.log`. The new identity flow used 1440px office and 390px phone viewports, real OIDC, screenshots, no page errors and automated accessibility checks. The earlier 113-case audit is separate dated evidence, not a new whole-browser-suite run. |
| Original-data migration | A fresh copy of checkpoint SHA-256 `0894046de72f867de7f64369fad3e500d17d68de4b11625886e845faf55b6161` migrated to 075 with integrity `ok`; all values in the 156 prior business tables' existing columns were preserved. Added membership columns retain the legacy password default. All 157 original database tables still match the checkpoint. `tmp/identity-operator-fixture-accepted.log`. |
| Dependencies | Final `npm audit` reports zero known vulnerabilities in the installed lockfile graph. `tmp/identity-dependency-audit-final.json`. This does not replace application security or provider review. |
| Build and budgets | Lint, production build, release and HAI contracts passed. Bundle: 514,801 gzip bytes. The total budget was deliberately raised from 510,000 to 520,000 for the added account surfaces; their separately limited lazy assets use 6,961 of 10,000 gzip bytes. Largest JavaScript/CSS budgets were not raised. |
| Container | Rebuilt production image passed authenticated ledger start/restart/shutdown at migration 075. A separate non-root, read-only registry container with its own volume and network disabled passed actual service startup, OIDC discovery, signing-key persistence and Docker healthchecks across restart. `tmp/identity-container-accepted-final.log`. The healthcheck now selects the actual service; private company-binding JSON is excluded from build context. |
| Windows | Rebuilt `release/ContractorAI-windows-x64` with Node 22.23.2 passed migration 075, company boundaries and separate identity-service startup/discovery/key persistence across restart. `tmp/identity-windows-accepted-final.log`. HAI publication is a local fixture; ngrok uses a test double, not a real tunnel. |

All disposable database/container verification services were stopped and removed.
No operator preview was restarted, no real identity service was activated, and no
commit, push, deployment or external provider action was performed.

Phase 2 and the full goal remain open. Next boundaries are rollback-safe registry
recovery/key rotation, an explicit one-authority local-to-hosted handover, then the
shared work model, resource-feasible planning and combined disruption recovery.

## 2026-09-12 Registry Recovery Increment

The preceding section records the earlier identity increment. Registry migration
`002_registry_recovery` now adds the separate procedures in
[Identity Recovery](IDENTITY_RECOVERY.md) and
[ADR 0002](adr/0002-registry-recovery-does-not-restore-access.md).
Company ledger migration 075 is unchanged.

The maintenance CLI writes a bounded AES-256-GCM snapshot with an independent key
and verifies it after writing. Restore accepts a new empty database and the exact
registry/issuer only; it preserves identities, relationships and the audit chain,
but never restores passwords, recovery codes, signing/session state or active
company membership. It generates fresh company secrets, requires a new registry
key, and leaves incomplete targets unready. Each person needs reviewed recovery
and each company must separately readmit them.

Assisted recovery requires an exact person ID/login, named registry operator and
independent identity/delivery references. Its thirty-minute code is private,
single-use and cancellable. Issuance does not lock the account or change access;
redemption revokes sessions and replaces the recovery-code set without altering
membership. No public/company-owner bypass or automatic delivery was introduced.
Key rotation requires a verified current checkpoint, rejects changed data,
invalidates old replicas and credentials, and preserves passwords and memberships.

The Windows build now refuses recognized operator data and private configuration
inside its generated target before cleanup. Use a separate absolute private data
directory; file modes alone do not establish Windows ACL protection.

| Evidence | Verified result |
| --- | --- |
| Node | Full local run: 643 discovered, 604 passed, 39 PostgreSQL-dependent skips, no failures. `tmp/registry-recovery-node-full.log`. Includes recovery output-failure rollback, stale replica rejection and the package data guard. Skips are not passes. |
| PostgreSQL | Both registry contract/recovery tests passed on disposable PostgreSQL 17 with TLS 1.3 and an authorized certificate. Recovery used a separate empty database. `tmp/identity-recovery-postgres.log`. This is not managed EU-provider acceptance. |
| Frontend | 40 component tests passed across 12 files. `tmp/identity-recovery-frontend.log`. Includes one-time assisted recovery codes and clearing password/code input. |
| Browser | Seven Chromium workflows passed again after the final UI changes: personal identity/admission/normal and assisted recovery, legacy worker/owner enrollment and operator/field sessions. `tmp/registry-recovery-browser-final.log`. The identity flow includes desktop/mobile layouts, real OIDC and automated accessibility checks. This is targeted coverage, not a new execution of every browser test. |
| Final contracts | Lint, production build, release/HAI contracts and 21 focused recovery/configuration/delivery tests passed. `tmp/registry-recovery-lint-final.log` and `tmp/registry-recovery-final-contracts.log`. Bundle: 514,820 gzip bytes against 520,000; account assets: 6,984 against 10,000. No budgets were raised in this increment. |
| Original data | Fresh copied-fixture migration to 075 passed integrity and retained all existing-column values in 156 business tables. All 157 original operator tables still match the recorded checkpoint. `tmp/registry-recovery-operator-fixture.log`. No original runtime was started or migrated. |
| Container | Actual production image passed ledger migration 075 and separate non-root/read-only/network-disabled registry startup, health, OIDC discovery and signing-key persistence. Its included maintenance CLI created, readback-verified and restored a private backup. `tmp/registry-recovery-container.log`. |
| Windows | Rebuilt Node 22.23.2 package passed ledger/registry startup and restart, discovery, signing-key persistence and actual packaged maintenance backup/verification/restore. `tmp/registry-recovery-windows-smoke.log`. HAI uses a local fixture and ngrok a test double, not a public tunnel. |

This completes the local registry-recovery increment, not phase 2 or the full
goal. Authoritative local-to-hosted handover, offline recovery, provider drills,
expanded work models, feasible resource planning and later accepted phases remain.
No real account service, hosted deployment or provider delivery is activated by
this work. No commit or push was performed.

## 2026-09-12 Company Handover Increment

Migration `076_company_authority_handover` adds the operator protocol in
[Company Handover](COMPANY_HANDOVER.md) and
[ADR 0003](adr/0003-company-authority-handover.md). A stopped source freezes,
seals one signed package to a separate target key, verifies the target's import
receipt and retires before releasing that target. Database-native guards block
frozen/staged/retired business writes, including existing SQLite connections and
PostgreSQL truncation. Authority transitions have a separate verified history.

The source marker survives ordinary DB replacement and advances before commit.
Stale databases and uncertain source transitions fail closed. A lost target
commit acknowledgment retains potentially committed evidence instead of deleting
it. CLI commands recover missing output files from already retained permits,
verification receipts and releases; unverified/uncertain targets remain blocked.

Capability reporting now identifies the permit/release requirement. The dashboard
shows reviewed recovery as required and disables generic restore for an
authority-bound company. Direct restore validation also refuses it. Backups remain
available, but signed packages are not encrypted and do not establish disaster
recovery by themselves. The optional Compose secret mount keeps the target key
outside the image; real host permissions and provider policies need verification.

| Evidence | Verified result |
| --- | --- |
| Source checkpoint | `tmp/handover-checkpoint-20260912-185922/` retained 469 pre-edit source files. It is local, unencrypted and not a release backup. |
| Node | Final full local suite: 654 discovered, 614 passed, 40 PostgreSQL-dependent skips, no failures. `tmp/handover-node-release.log`. Skips are not passes. Earlier runs exposed stale expected option text and test-discovery lists/counts, now corrected; failed logs remain. All 14 focused release/package/discovery tests passed in `tmp/handover-final-delivery-accepted.log`. |
| PostgreSQL | All 62 tests passed on disposable PostgreSQL 17 with verified TLS, including real company relocation and a lost-COMMIT-acknowledgment fault. `tmp/handover-postgres-full.log`. The six operations/readiness cases passed again after final capability changes in `tmp/handover-postgres-capabilities.log`. Object storage is a company-scoped test double, not a live EU service. |
| Frontend | 40 component tests across 12 files passed. `tmp/handover-frontend-final.log`. The new recovery state has separate real-browser/API coverage. |
| Browser | Nine Chromium workflows passed together, covering identity/recovery, legacy worker admission/enrollment, office/field sessions, offline-company boundaries and the new recovery status. `tmp/handover-browser.log`. The new flow checks 1440px desktop, 390px mobile, disabled restore, Dutch status, overflow, page errors and automated accessibility. A final targeted rerun with inspected desktop/mobile panel screenshots passed in `tmp/handover-browser-final.log` after correcting an ambiguous screenshot selector. Discovery now includes 115 workflows; this is not a new execution of all of them. The legacy Browser skill is not installed in this session; verification used the repository's Playwright runner and disposable runtimes. |
| Existing data | Fresh checkpoint copy migrated to 076 with SQLite integrity `ok` and all prior-column values in 156 business tables preserved. All 157 original operator tables still match the checkpoint. `tmp/handover-operator-fixture.log`. The original runtime was not started or migrated. |
| Performance | Production fixture of 5,000 jobs, 20,000 tasks, 2,500 opportunities and 25,000 chained audit events passed all configured thresholds. `tmp/handover-benchmark.json`. |
| Delivery | Lint, production build, release/HAI contracts and bundle budget passed. Bundle: 514,981 gzip bytes of 520,000; identity assets: 6,984 of 10,000. No budget increases. `tmp/handover-bundle-budget.json`; `tmp/handover-final-release.log`. |
| Windows | Actual rebuilt Node 22.23.2 package passed migration 076, no pending migrations, company boundaries, registry startup/restart and registry backup/restore. Its included handover commands passed real key creation, freeze, signed package, blocked startup, abort and retained marker checks. `tmp/handover-windows-smoke.log`. HAI is a local fixture; ngrok is a test double. |
| Container | Actual production image passed migration 076, non-root/read-only startup/restart/shutdown, persistent SQLite and registry checks. Included handover commands passed the same fixture sequence in a network-disabled container. `tmp/handover-container.log`. This is not Hetzner deployment or managed EU-provider acceptance. |

The full goal remains active. Authority-aware disaster recovery, source-key
recovery/rotation, reviewed registry origin rebinding, guided offline recovery,
the expanded shared work model, resource-feasible planning and all later accepted
phases remain. This protocol cannot prevent a privileged administrator cloning
every private key, old marker and DB file outside supported tools. No commit,
push, real provider activation or original operator restart was performed.

## 2026-09-12 Shared Work Dossier Increment

Migration `077_shared_work_context` adds the foundation documented in
[Shared Work Model](SHARED_WORK_MODEL.md): reusable sites/buildings/spaces and
installed assets, explicit job-party roles, and versioned work packages linked
to existing tasks and takeoff items. Office users can edit, archive, restore,
reuse and export this context. Edits retain source hashes, command receipts and
audit history; stale writes and changed replay payloads are refused.

The same model now feeds assigned workers' online and encrypted offline packs,
dossier review source hashes, package-linked positions and operational exports.
Private payer/owner details stay in the office. Explicit site-contact sharing
does not expose other roles or source references. A current work-pack read no
longer returns an old acknowledgment snapshot containing withdrawn contact data.
Historical ledger evidence is retained; already downloaded offline copies remain
subject to the existing seven-day expiry and cannot be remotely erased offline.

Package changes and completed/cancelled scope prevent new placement under stale
terms. Existing placements remain retained. There is no automatic safety release,
client acceptance, purchasing, messaging, payment or resource-feasible scheduling.

| Evidence | Verified result |
| --- | --- |
| Checkpoint | Source checkpoint and SHA-256 manifest retained at `tmp/work-model-checkpoint-M3tOP3/`. Not encrypted. Original operator data was not started, reset or migrated. |
| Local Node | Full run: 661 discovered, 620 passed, 41 PostgreSQL-dependent skips, zero failures. `tmp/work-context-node-release.log`. Final focused API, work-pack, backup, package and compatibility checks: 24 passed, two PG skips in `tmp/work-context-final-contracts.log`. Skips are not passes. |
| PostgreSQL | 41 tests passed without skips across the shared-work, governed-handover, local-to-hosted migration and common ledger contracts. `tmp/work-context-postgres.log`. Disposable PostgreSQL 17 used verified TLS; object storage was a scoped test double. This is not a new run of every optional PostgreSQL file or managed-provider acceptance. The migration test exposed and fixed canonical control-seed handling in empty targets, and verifies retained location hierarchy/package links after transfer. |
| Frontend | 44 tests across 13 files passed. `tmp/work-context-frontend-release.log`. Includes exact retry after unknown results, retained stale drafts, read-only roles and an editor losing edit authority. |
| Browser | Five real Chromium workflows passed together: office work dossier, mobile field packs, worker registration/enrollment, owner release/admission and company-scoped offline folders. `tmp/work-context-browser-final-accepted.log`. The new workflow creates/edits/archives/restores/exports context, checks 1440px and 390px views, accessibility, runtime errors and actual offline reload/decryption. Its screenshots were inspected. Browser plugin skill unavailable; the existing Playwright runner used disposable servers. Discovery is 116 workflows, not a claim all 116 ran again. |
| Original data | Fresh checkpoint copy migrated to 077 with integrity `ok`; existing-column values in 156 prior business tables are unchanged. All 157 original operator tables still match the initial checkpoint. `tmp/work-context-operator-fixture-final.log`. |
| Build and budgets | Lint, production build and release contract passed. `tmp/work-context-lint-release.log`, `tmp/work-context-release-contract.log`. Bundle: 520,601 gzip bytes; new shared-work assets: 4,893. The total cap was explicitly raised from 520,000 to 526,000 with a separate 6,000-byte shared-work cap; largest JS/CSS caps are unchanged. `tmp/work-context-bundle-budget.json`. |
| Windows | Rebuilt Node 22.23.2 package at `release/ContractorAI-windows-x64` passed migration 077, zero pending migrations, company/registry/runtime checks and the packaged handover fixture, extended with retained work-context create/reopen assertions. `tmp/work-context-windows-smoke-final.log`. HAI uses a local fixture and ngrok a test double, not a real public tunnel. |
| Container | Rebuilt production image passed authenticated non-root/read-only startup, restart, persistent SQLite, registry recovery and the extended packaged handover/work-context fixture. `tmp/work-context-container-final.log`. Temporary images, containers and volumes were removed. No Hetzner deployment occurred. |

The previous goal turn was progress; this turn delivers another verified
increment, not completion of phase 3 or the full goal. Independently evidenced
partial output, inspection/acceptance/payment states, installed-service history,
all work profiles, feasible shared-resource planning and combined-disruption
recovery remain. Phase 2 recovery/rebinding gaps and phases 4-10 are still open.
No commit, push, provider activation or original operator restart was performed.

## 2026-09-12 Partial Work Delivery Increment

Migration `078_work_delivery_lifecycle` adds the operator/developer contract in
[Partial Work Deliveries](WORK_DELIVERIES.md). A described portion of an existing
work package retains whole production entries and/or completed tasks without
creating a second quantity ledger. Each source can have only one active delivery
allocation. Approved corrections release allocations but retain their history.

Physical output, linked inspections, a reviewed named customer response and
existing invoice/payment reconciliation remain independent. Pending payments do
not count as received; credit/write-off settlement is not labelled payment. An
acceptance requires a traceable same-job document, authority reference and response
date consistent with known execution dates. Source changes preserve the historical
outcome but prevent a stale approval from silently authorizing changed work.

The office can retain portions, link checks/milestones, request reviewed responses
or corrections, inspect history and export. Saving refreshes the approval queue
without closing unrelated open dossier forms. Assigned workers receive only the
operational portion and inspection state, including in encrypted offline packs.
Customer names, authority references, response evidence and finance stay private.
The audit found and fixed an assigned-worker document-download path that could
otherwise expose the new private evidence. Evidence used in a response request
stays office-only even after rejection; existing offline/downloaded copies cannot
be remotely erased. This is not a claim that every legacy document path was audited.

Commands retain exact retry receipts and reject stale/conflicting writes. Approval
resolution locks and rechecks sources; PostgreSQL replicas enforce the same unique
allocations and company-authority fences. Backup verification covers snapshots,
allocations and approval chains. Governed transfer preserves immutable history.
Dossier review includes source changes but does not send messages or resolve them
autonomously. No whole-job completion, safety clearance or contract release follows
from recording a delivery.

| Evidence | Verified result |
| --- | --- |
| Checkpoint | Pre-edit source manifest at `tmp/work-model-checkpoint-k6mAhU/checkpoint-manifest.json` covers 491 files. Local and unencrypted. Original operator data was not started, reset or migrated. |
| Local Node | Full run: 669 discovered, 627 passed, 42 PostgreSQL-dependent skips, zero failures. `tmp/work-delivery-node-final.log`. After final response-chronology hardening, 84 focused contracts passed with no skips in `tmp/work-delivery-final-contracts.log`. Skips are not passes. |
| PostgreSQL | 42 tests passed without skips across delivery, concurrent replica writes, governed handover, local-to-hosted migration and common ledger contracts. `tmp/work-delivery-postgres-final.log`. Disposable PostgreSQL 17 used verified TLS; object storage was a scoped test double. The import fixture checks retained delivery history. Not every optional PostgreSQL file ran again, and this is not managed-provider acceptance. |
| Frontend | 48 tests across 14 files passed. `tmp/work-delivery-frontend-accepted.log`. Includes exact retries after uncertain outcomes, retained conflict drafts, authority loss, escaped content and independent states. |
| Browser | Four real Chromium workflows passed: partial delivery, shared work dossier, production control and mobile field work packs. `tmp/work-delivery-browser-accepted.log`. Coverage includes 1440px desktop/390px mobile, accessibility, overflow, runtime errors, export, preservation of another open form, private evidence boundaries and actual encrypted offline reload/unlock. Screenshots were inspected. Discovery is 117 workflows, not a new execution of all of them. Verification used the repository Playwright runner with disposable runtimes, not the unavailable legacy Browser skill. |
| Original data | Fresh checkpoint copy migrated to 078 with integrity `ok`; existing-column values in 156 prior business tables are unchanged. All 157 original operator tables still match the initial checkpoint. `tmp/work-delivery-operator-final.log`. Source SHA-256 remains `0894046de72f867de7f64369fad3e500d17d68de4b11625886e845faf55b6161`. |
| Build and budgets | Lint, production build, release contract and bundle checks passed. `tmp/work-delivery-lint-accepted.log`, `tmp/work-delivery-release-accepted.log`, `tmp/work-delivery-bundle-accepted.json`. Total compressed assets: 524,995 of 526,000 bytes; delivery assets: 4,027 of the new 4,500-byte sub-budget. No existing budget was raised. |
| Windows | Rebuilt Node 22.23.2 package passed migration 078, zero pending migrations, company/registry/runtime checks and actual packaged handover with retained work-context and delivery create/reopen assertions. `tmp/work-delivery-windows-smoke.log`. HAI uses a local fixture and ngrok a test double, not a public tunnel. |
| Container | Actual production image passed authenticated non-root/read-only startup, restart, persistent SQLite, registry recovery and the extended packaged handover/delivery fixture. `tmp/work-delivery-container.log`. This is not Hetzner deployment or live EU-provider acceptance. |

This is a verified increment in phase 3, not completion of that phase or the full
goal. Direct client-portal partial responses, explicit inspection coverage,
remaining-scope calculation across revised profiles, money allocation/retention,
final contractual closure and installed-service history remain. Phase 2 recovery
and rebinding gaps and phases 4-10 also remain. There was no original operator
restart, commit, push, deployment, real customer communication or provider action.

## 2026-09-12 Installed Asset History Increment

Migration `079_installed_asset_history` adds the contract in
[Installed Asset History](INSTALLED_ASSET_HISTORY.md). An installed component
retains its existing physical identity across linked jobs, manufacturer/model/
serial details, and source-backed installation, maintenance, repair, inspection
work and removal reports. A replacement records two distinct assets atomically.
Corrections retain the original evidence and correct both replacement records.
Historical source documents report prior information, not newly verified work.

Existing warranty, aftercare and recurring registers remain authoritative. Their
links follow the asset without silently changing their status. An active linked
plan can prepare an internal maintenance dossier with unassigned tasks and asset
work packages. Repeating this action reuses its unfinished preparation; changed
asset scope blocks reuse instead of silently omitting units. This does not book
a visit, assign a worker, confirm an order or send a customer message.

Office forms, source-job navigation, export, exact retries and stale-write errors
are connected to the same model. Assigned field workers see only directly scoped
asset identities and explicitly shared, separate operational summaries,
including in encrypted offline packs. Private reports, evidence, finance and
plan notes stay out of this projection. Sharing can be withdrawn even from an
archived source job without reopening ordinary operational writes. Historical
evidence remains private after correction; downloaded offline copies cannot be
remotely erased. Forms survive refresh conflicts while mounted, not browser exit.

Source changes feed dossier review. SQLite/PostgreSQL authority guards, backup
verification, immutable hosted imports and operational exports cover the four new
tables. Inspection work, safe-use release, customer acceptance, payment and
warranty entitlement remain independent. No service interval or legal obligation
is inferred from a serial number, date or reported maintenance task.

| Evidence | Verified result |
| --- | --- |
| Checkpoint | Pre-edit source manifest at `tmp/work-model-checkpoint-F2kleN/checkpoint-manifest.json` covers 501 files. Local and unencrypted, not a production recovery backup. |
| Local Node | Final full run: 678 discovered, 635 passed, 43 PostgreSQL-dependent skips, zero failures. `tmp/asset-history-node-accepted.log`. Includes archived-source sharing withdrawal, changed recurring asset scope, exact retries, rollback, private evidence and backup integrity. Skips are not passes. |
| PostgreSQL | 41 tests passed without skips across the asset, governed handover, local-to-hosted migration and common ledger contracts in `tmp/asset-history-postgres.log`. The final asset contract and added concurrent-replica subtest passed again with no skips in `tmp/asset-history-postgres-final.log` (two tests). These overlapping runs are not 43 unique passes. Disposable PostgreSQL 17 used verified TLS; object storage was a scoped test double. Not every optional PostgreSQL file ran again, and this is not managed-provider acceptance. |
| Frontend | 53 tests across 15 files passed in `tmp/asset-history-frontend-accepted.log`. Includes uncertain-result retry, retained conflict drafts, read-only and lost authority, escaped content, explicit sharing and preventing maintenance preparation over another open editor. |
| Browser | Four real Chromium workflows passed: installation history, field work packs, shared work dossier and partial delivery. `tmp/asset-history-browser-accepted.log`. Includes 1440px desktop/390px mobile, accessible controls, overflow/page-error checks, export, maintenance preparation, field privacy and actual encrypted offline reload/unlock. Desktop/mobile/offline screenshots were inspected; the mobile heading stays below the fixed dossier tabs. Discovery is 118 workflows, not a claim all 118 ran again. Verification used the repository Playwright runner with disposable runtimes; the legacy Browser skill was unavailable. |
| Original data | A fresh checkpoint copy migrated to 079 with integrity `ok` and prior-column values in 156 business tables preserved. All 157 original operator tables still match the initial checkpoint. `tmp/asset-history-operator-final.log`. Checkpoint SHA-256 remains `0894046de72f867de7f64369fad3e500d17d68de4b11625886e845faf55b6161`. The original runtime was not started or migrated. |
| Build and budgets | Lint, production build, release contract and bundle checks passed. `tmp/asset-history-lint-final.log`, `tmp/asset-history-release-final.log`, `tmp/asset-history-bundle-final.json`. Total gzip assets: 529,387 bytes. The total cap was explicitly raised from 526,000 to 531,000 for this new panel, with a separate 4,500-byte asset-history cap (actual 3,948); existing largest-JS/CSS and other feature caps are unchanged. |
| Windows | Actual rebuilt Node 22.23.2 package passed migration 079, zero pending migrations, company/registry/recovery checks and packaged handover with retained work-context, delivery and installed-history create/reopen assertions. `tmp/asset-history-windows-build.log`, `tmp/asset-history-windows-smoke.log`. HAI is a local fixture; the printed ngrok address is a test double, not a live public tunnel. |
| Container | Actual production image passed authenticated non-root/read-only startup, restart, persistent SQLite, registry recovery and the extended packaged history/handover fixture. `tmp/asset-history-container.log`. Its temporary containers, volumes and image were removed and absence checked. This is not Hetzner deployment or live EU-provider acceptance. |

Earlier failed browser-selector, archive-fixture and initial bundle-budget logs
remain available. The archive test now resolves pending fixture approvals through
the existing API before requesting archive; product approval gates were not
weakened. Only the successful reruns above count as verification.

The preceding goal turn was progress; this delivers another verified increment,
not completion of phase 3 or the total solution. Required inspection coverage,
direct client partial acceptance, commissioning/safe-use release, warranty terms,
client asset publication, resource-feasible maintenance and final contractual
closure remain. Phase 2 recovery/rebinding gaps and phases 4-10 remain open.
High-volume asset-history performance was not separately benchmarked. There was
no original preview restart, commit, push, deployment or real provider action.

## 2026-09-12 Reviewed Inspection Coverage Increment

Migration `080_inspection_coverage` adds the contract in
[Inspection Coverage](INSPECTION_COVERAGE.md). An office operator explicitly
defines the required controls for one retained executed portion, including its
scope, criteria, field instructions and whether evidenced non-applicability may
be considered. A different authenticated principal reviews the plan. This is
not proof of two physical people, professional competence or statutory completeness.

Each listed control then requires an approved current inspection and a separate
source document, or an explicitly permitted evidenced non-applicability outcome.
A second review checks the complete mapping against current physical scope,
approval content, checklist integrity, installation-QC references, corrective
observations and evidence metadata. A passed inspection alone does not establish
complete coverage. Approved plan revisions require fresh coverage; stale sources
and pending delivery corrections invalidate reliance without deleting history.

The office editor, readable approval preview, history and export are connected.
Visual browser inspection exposed a stale neighboring delivery summary after a
manual coverage refresh. Both now refresh together, with a browser assertion for
their matching status and no forced closure of the mounted coverage draft.
Assigned workers receive only control titles, explicit field instructions and
coverage status, online and in the existing encrypted offline snapshot. Private
criteria, assessment notes and source evidence remain office-only. Downloaded
snapshots cannot learn about later changes while disconnected.

The durable dossier review raises an internal incomplete-coverage issue. Commands
retain exact retry receipts, lock their sources and reject concurrent stale
writes. Both new tables have SQLite/PostgreSQL company-authority guards and are
included in backup verification, immutable hosted transfer, operational export
and actual Windows/container handover fixtures. Coverage does not issue a safety
or commissioning release, client acceptance, payment, order or external message.

| Evidence | Verified result |
| --- | --- |
| Checkpoint | Pre-edit source manifest at `tmp/work-model-checkpoint-Vf3R4C/checkpoint-manifest.json` covers 511 files. Local and unencrypted, not a production recovery backup. |
| Local Node | Final full run: 687 discovered, 643 passed, 44 PostgreSQL-dependent skips, zero failures. `tmp/inspection-coverage-node-release.log`. Includes checklist integrity, changed installation references after task completion, approval-content mismatch, current proof, exact retry, private evidence and backup verification. Skips are not passes. |
| PostgreSQL | Final selected run: 42 passed with no skips or failures. `tmp/inspection-coverage-postgres-release.log`. Coverage, concurrent receipt claims, asset/work/delivery contracts, common ledger behavior and genuine local-to-hosted handover were checked using disposable PostgreSQL 17 and verified TLS. The handover compares retained coverage history; object storage is a scoped test double. This is not every optional PostgreSQL suite or managed-provider acceptance. |
| Frontend | 58 tests across 16 files passed in `tmp/inspection-coverage-frontend-final.log`. Includes uncertain-result retry, retained conflict drafts, lost authority, explicit mappings, read recovery, escaped source content and notifying the surrounding dossier on manual refresh. |
| Browser | Four real Chromium workflows passed: inspection coverage, installation history, partial deliveries and mobile work packs. `tmp/inspection-coverage-browser-release.log`. Includes office submission, a separate review session with readable criteria, matching adjacent delivery status, export, 1440px desktop/390px mobile, accessibility/overflow checks, field privacy and actual encrypted offline reload/unlock. Screenshots were inspected. Discovery is 119 workflows, not an execution of all 119. The repository Playwright runner used disposable runtimes; the legacy Browser skill was unavailable. |
| Original data | Fresh checkpoint copy migrated to 080 with integrity `ok` and prior-column values in 156 business tables preserved. All 157 original operator tables still match the initial checkpoint. `tmp/inspection-coverage-operator-release.log`. Checkpoint SHA-256 remains `0894046de72f867de7f64369fad3e500d17d68de4b11625886e845faf55b6161`. The original runtime was not started or migrated. |
| Build and budgets | Lint, production build, release contract and bundle checks passed. `tmp/inspection-coverage-lint-final.log`, `tmp/inspection-coverage-release-final.log`, `tmp/inspection-coverage-bundle-release.json`. Total gzip assets: 533,638 bytes. The total cap was explicitly raised from 531,000 to 536,000 for this new panel, with a separate 4,500-byte coverage cap (actual 3,911); existing largest-JS/CSS and other feature caps are unchanged. |
| Windows | Actual rebuilt Node 22.23.2 package passed migration 080, zero pending migrations, company/registry/recovery checks and packaged handover with retained work-context, delivery, installed-history and coverage create/reopen assertions. `tmp/inspection-coverage-windows-build.log`, `tmp/inspection-coverage-windows-smoke.log`. HAI is a local fixture; the printed ngrok address is a test double, not a live public tunnel. |
| Container | Actual production image passed authenticated non-root/read-only startup, restart, persistent SQLite, registry recovery and the extended packaged coverage/handover fixture. `tmp/inspection-coverage-container.log`. Its temporary containers, volumes and image were removed and absence checked. The disposable PostgreSQL container and anonymous volume were also removed. This is not Hetzner deployment or live EU-provider acceptance. |

Earlier failed browser-selector, edge-fixture, PostgreSQL-count-type and initial
bundle-budget logs remain available; only successful final runs count as proof.
The PostgreSQL assertion now normalizes `count(*)` across adapters, rather than
loosening uniqueness. Edge fixtures were corrected to obey existing two-item
checklist, completion-evidence and review-reason rules; those product gates were
not weakened. The final PostgreSQL run continued processing while its test output
was buffered; its completed report contains no failures or skips.

This is another verified phase-3 increment, not completion of phase 3 or of the
total solution. Pre-execution profile-based control obligations, commissioning
and safe-use release, direct client partial acceptance, remaining-scope planning,
final contractual closure and wider work/resource recovery remain. Phase 2
recovery/rebinding gaps and phases 4-10 are still open. High-volume coverage reads
and native-device acceptance were not separately benchmarked or verified here.
No original preview restart, commit, push, deployment, customer communication,
real provider activation or consequential external action occurred.

## 2026-09-13 Client Partial-Delivery Response Increment

Migration `081_client_delivery_responses` adds the contract in
[Client Partial-Delivery Responses](CLIENT_DELIVERIES.md). The office selects one
retained executed portion and one approved client access, explicitly describes
the public scope and intended recipient, records a private authority basis and
sets an expiry. Only already-visible photographs from that exact conversation
can accompany the offer. Publication requires an existing ledger approval; it
does not send a message through email or WhatsApp.

The client sees the limited scope, quantities, coverage status and shared photos,
then submits acceptance, reservations or a dispute, a name, an authority
declaration, a note and optionally a photograph. The existing private photo chat
retains the upload. Response creation atomically records a conversation message,
private acceptance evidence, the existing partial-delivery review request and a
replay receipt. A verified office decision, with an explicit review reason, is
required before the delivery's customer-response state changes. A typed name and
portal possession are not strong identity, an electronic signature or proof of
authority. Execution, inspection, safe use, payment and job closure stay separate.

Office history/export, readable approval previews, the mobile client form and
conversation refresh are connected. The adjacent office delivery status refreshes
after review. A responded offer now reads **Beantwoord**, not **Reactie mogelijk**.
Client text supports Dutch and English; the new office panel follows the existing
Dutch domain panels, not a claim of complete office localization. Exact retries
reuse known uploads and retained command receipts. Mounted drafts survive stale
reads or uncertain responses, but browser-exit form recovery and offline client
response are not implemented.

Changed execution, inspection, coverage, photo provenance or portal access stops
new reliance on an obsolete offer. Revocation/expiry after completed review does
not erase historical acceptance. Quarantined or altered photo proof marks the
delivery's current-evidence state stale while retaining the customer statement.
Clients and field workers do not receive private authority/review notes or
acceptance-document identifiers. Source-bound conversation analysis can consume
the retained inbound statement without activating an AI provider or asserting
visual analysis. External messaging, ordering and finance remain unchanged.

Three new tables have SQLite/PostgreSQL company-authority guards and participate
in operational export, backup verification and governed handover. Hosted transfer
preserves sealed approval text and conversation provenance even when user text
equals an old evidence filename; live document storage references still move.
The actual PostgreSQL handover fixture tests this collision, not just a mock
replacement function. Windows/container fixtures create, review, package and
reopen the new records against their packaged runtime modules.

| Evidence | Verified result |
| --- | --- |
| Checkpoint | Pre-edit source manifest at `tmp/work-model-checkpoint-ycWgRl/checkpoint-manifest.json` covers 522 files. Local and unencrypted, not a production recovery backup. |
| Local Node | Final full run: 698 discovered, 653 passed, 45 PostgreSQL-dependent skips, zero failures. `tmp/client-delivery-node-verified.log`. Includes final immutable-text transfer regression, response rollback, exact retries, stale proof, roles, privacy and backup checks. Skips are not passes. |
| PostgreSQL | Selected release run: 44 passed with no skips or failures in `tmp/client-delivery-postgres-release.log`. Client delivery, concurrent claims, common ledger, company/work/asset/coverage contracts and real governed transfer were checked using disposable PostgreSQL 17 with verified TLS. After the last immutable-text fix, the client and handover files passed again: four overlapping tests in `tmp/client-delivery-postgres-transfer-verified.log`. These are not 48 unique passes. Object storage is a scoped test double; not every optional PostgreSQL file ran again and no managed provider was accepted. |
| Frontend | 65 tests across 18 files passed in `tmp/client-delivery-frontend-verified.log`, with two workers. Includes exact uncertain retries, a known photo upload reused after response failure, retained conflict drafts, authority loss, read recovery, escaped content and answered-state labels. Earlier default-worker jsdom saturation caused timeouts; no product gate or test timeout was weakened. |
| Browser | Six real Chromium workflows passed together: client partial delivery, client photo conversation, encrypted offline work packs, mobile field instructions, inspection coverage and existing work deliveries. `tmp/client-delivery-browser-verified.log`. Includes office publication, a separate review session, client photo upload and loaded-image checks, chat/adjacent delivery refresh, export, withdrawal, reload, 1440px desktop/390px mobile, accessibility/overflow checks and no automatic job/finance closure. Screenshots were inspected. The photo is a synthetic PNG fixture, not a real construction-image or AI-vision acceptance test. Discovery is 120 workflows, not an execution of all 120. The repository Playwright runner used disposable runtimes. |
| Original data | Fresh checkpoint copy migrated to 081 with integrity `ok`; prior-column values in 156 business tables are preserved and all 157 original operator tables still match the initial checkpoint. `tmp/client-delivery-operator-verified.log`. Checkpoint SHA-256 remains `0894046de72f867de7f64369fad3e500d17d68de4b11625886e845faf55b6161`. The original runtime was not started or migrated. |
| Build and budgets | Lint, production build, release contract and bundle checks passed. `tmp/client-delivery-lint-verified.log`, `tmp/client-delivery-release-verified.log`, `tmp/client-delivery-bundle-verified.json`. Total gzip assets: 541,836 bytes. The total cap was explicitly raised from 536,000 to 544,000 for the two new panels, with a separate 8,500-byte client-delivery cap (actual 7,757); existing largest-JS/CSS and other feature caps are unchanged. |
| Windows | Actual rebuilt Node 22.23.2 package passed migration 081, zero pending migrations, company/registry/recovery checks and packaged handover including retained client offers and reviewed responses. `tmp/client-delivery-windows-build.log`, `tmp/client-delivery-windows-smoke.log`. HAI is a local fixture; the printed ngrok address is a test double, not a live public tunnel. |
| Container | Actual production image passed authenticated non-root/read-only startup, restart, persistent SQLite, registry recovery and the extended client-delivery/handover fixture. `tmp/client-delivery-container.log`. Temporary image, containers and volumes were removed and absence checked. Both disposable PostgreSQL containers and their anonymous volumes were removed. No Hetzner deployment or live EU-provider acceptance occurred. |

Earlier failed browser-selector, frontend-fixture and PostgreSQL row-prototype
comparison logs remain available; only successful final runs count as proof.
Export rows now have consistent plain-object representation across adapters.
Browser traces and loaded-image assertions confirmed authenticated photo reads;
authentication was not relaxed to suppress separate unauthorized test requests.
Documentation evidence was finalized after package verification; the retained
Windows package documentation is synchronized without changing tested runtime
code. The ephemeral container image was removed after its successful smoke run.

This is another verified phase-3 increment, not completion of phase 3 or of the
total solution. Strong recipient identity/signatures, commissioning/safe-use
release, remaining-scope planning, final contractual closure, broader profiles
and workforce/resource recovery remain. Phase 2 recovery/rebinding gaps and
phases 4-10 remain open. High-volume client-delivery reads, offline client
responses and native-device acceptance were not benchmarked or verified here.
No original preview restart, commit, push, deployment, real customer message,
provider activation or consequential external action occurred.

## 2026-09-24 - Work Balance Release Evidence

Migration 082 connects an approved production basis to allocated work packages,
retained production and partial delivery. A package position is not offered when
the allocation is pending, stale, unallocated, overproduced or inconsistent with
the approved work scope. Work balance remains an estimate and reconciliation
control; it does not establish contract meaning, schedule feasibility, customer
acceptance, safe-use release, finance or an external commitment.

| Gate | Verified result |
| --- | --- |
| Local Node | 703 discovered: 657 passed, 46 PostgreSQL-only skips, zero failures. Final log: `tmp/work-balance-node-final.log`. Skips are not passes. |
| PostgreSQL | Work-balance approval/execution/authority contract passed against disposable PostgreSQL 17 with verified TLS. The governed handover test and its uncertain-commit subtest passed in a separate run (2 passed, zero skipped/failures). Test object storage was a scoped local double. Temporary containers and volumes were removed. |
| Frontend | 67 tests in 19 files passed, including work-balance validation, approval and stale/error handling. |
| Browser | Work-balance desktop/mobile Chromium E2E passed: approval through reviewer session, retained partial delivery, remaining-scope projection, stale-position blocking after unallocated output, accessibility checks and 390px overflow check. No console or page errors. Screenshots inspected: `C:\Users\NO\AppData\Local\Temp\contractor-work-balance-1790201103531-desktop.png` and `C:\Users\NO\AppData\Local\Temp\contractor-work-balance-1790201103531-mobile.png`. This selected workflow is not the full discovered E2E inventory. |
| Code/build | ESLint, production build, release contract and bundle verification passed. Total gzip assets: 546,607 / 549,000 bytes; work-balance JS+CSS: 4,186 / 5,000 bytes. |
| Windows | Rebuilt standalone package passed on Node 22.23.2 with migration 082, zero pending migrations and the packaged approved-balance backup/handover round-trip. The tunnel and identity details are local test fixtures, not live provider acceptance. |
| Container | Rebuilt production image passed authenticated, non-root, read-only, loopback startup, persistent SQLite/restart and packaged handover checks; migration 082. Temporary smoke container and associated volume were removed. |
| Original operator data | No startup, migration, reset or mutation of the original local operator runtime. Earlier checkpoint identity remains as documented above; this increment used isolated test databases. |
| Publication | No commit, push, deployment, provider activation or customer communication. |

This evidence closes the local release checks for the work-balance increment,
not the total-solution plan or all of phase 3. Broader resource planning,
schedule feasibility, contractual closeout, remaining phase-2 recovery and
phases 4-10 remain open.

## 2026-09-24 - Unknown-return Availability and Replacement Planning

An operator can now record an operational unavailability period without
inventing a return date. The form requires a follow-up date within 31 days,
rejects a contradictory end date, and does not collect diagnosis, illness or
family-care details. The period remains an open-ended scheduling fence after
the follow-up date; the follow-up only prompts review and never restores
availability. Existing approval-backed cancellation is still required before
the block is removed. Assignment conflict checks and the two-week capacity
board use the open-ended period, and the office register marks due reviews.

For affected assignments, the register proposes at most five replacements.
Suggestions must be available in the window, have the exact retained role, no
other overlapping assignment, no pending retirement, and no mandatory
qualification blocker. Ranking is transparent: matching retained skills first,
then standby ahead of regular available status, then name. A coordinator can
open the job planner with the suggested worker and affected dates prefilled.
Submitting remains a separate operator action and invokes the existing
assignment and approval controls.

| Gate | Verified result |
| --- | --- |
| Focused Node/API | 5 workforce availability tests passed, including candidate selection, overlap/role/qualification exclusion, unknown-return replay, due follow-up and blocked far-future assignments. |
| Full local Node suite | 705 discovered: 659 passed, 46 PostgreSQL-only skips and zero failures. PostgreSQL-only tests were run separately against disposable PostgreSQL; skipped is not counted as passed. |
| Frontend | 67 tests across 19 files passed. The jsdom setup provides isolated in-memory localStorage for identity persistence assertions and clears it after every test. |
| PostgreSQL | The prior unknown-return ledger contract was exercised on disposable PostgreSQL 17 with verified TLS. In this replacement-planning run, PostgreSQL-only tests were skipped because no test URL was configured; the new candidate-ranking path is verified against isolated SQLite only. |
| Browser | Both workforce availability Chromium workflows passed. Unknown return remains blocked after follow-up; the register shows an eligible standby replacement and opens its job with worker and dates prefilled. No replacement assignment is written before operator submission. The 390px viewport screenshot was inspected. |
| Build and release | ESLint, production build and release contract passed. Gzip: 548,062 / 549,000 bytes total; Work Balance chunk 4,186 / 5,000. Release contract: 93 canonical paths, 12 retired paths, 17 hosted environment keys and 599 source files. |
| Windows and container | Standalone passed Node 22.23.2, migration 082, zero pending migrations, identity startup/restart and packaged handover. Container passed authenticated, non-root, read-only, loopback-only startup; SQLite volume/restart; graceful shutdown; identity recovery; and packaged handover. Temporary image, containers and volume were removed after the run. |
| Original data and publication | The original local operator database was not started, reset, migrated or changed. No commit, push, deployment, provider action or customer communication occurred. |
| Data | No table migration was needed; the existing availability payload stores the explicit unknown-return state and review date. API output uses a null end date rather than exposing the internal open-ended fence. Existing known-end fingerprints remain compatible. |
| Remaining gap | Follow-up does not automatically change the worker's status. The operator must verify the return and request the existing approval-backed block cancellation. Replacement is a prefilled proposal, not an atomic old-to-new assignment swap: the operator still submits the assignment and separately resolves the old assignment. No worker, client or supplier is contacted. |

This closes an initial, governed replacement-discovery and prefilled planning
path, not atomic replacement, conditional capacity calendars, resource
optimization, schedule reflow or the full combined disruption path.

## 2026-09-24 - Approval-governed assignment replacement

Availability conflicts now support an explicit replacement request from the
operator register. The request retains the proposed worker, affected period,
original assignment snapshot and operational reason on the existing ledger and
approval records. Nothing changes on submission. Approval rechecks the original
assignment snapshot, the availability conflict, candidate status, schedule,
role, pending retirement and mandatory qualifications, plus open attendance.
Only after all checks pass does one transaction release the old assignment and
activate the proposed assignment. A rejection marks only the proposal rejected;
the old assignment remains as it was. Authenticated hosted approvals reject
self-approval; the single trusted local owner can complete the approval step.
No worker/client/supplier communication or schedule reflow is triggered.

| Gate | Verified result |
| --- | --- |
| Focused ledger tests | Eight availability tests passed, including approved atomic exchange, rejection preserving old coverage, stale candidate rollback, and authenticated independent-approver enforcement. |
| API integration | Two availability API tests passed; the replacement endpoint creates a pending proposal, keeps old assignment intact, and resolves through the normal approval route. |
| Full local Node suite | 709 discovered: 663 passed, 46 PostgreSQL-only skipped, zero failures. Skips are not counted as passes. |
| Frontend | 67 tests across 19 files passed. |
| Browser | The selected unknown-return Chromium flow passed, including the Dutch replacement dialog, pending-approval API state and unchanged original assignment before a decision. The existing 390px layout assertions also passed. This was one selected workflow, not the full E2E inventory. |
| Lint/build/release | ESLint, production Vite build and release contract passed. Bundle verification passed at 548,944 / 549,000 total gzip bytes; largest JS 556,626 bytes, largest CSS 296,785 bytes, Work Balance 4,186 / 5,000 gzip bytes. |
| Hosted DB | No PostgreSQL URL was configured for this increment; the new exchange transaction was verified against isolated SQLite only. The separate-approver rule is exercised in the ledger unit test, not a live authenticated hosted API. |
| Original operator data and publication | Original local operator DB untouched. No commit, push, deployment, provider action or customer communication. |

This completes an approval-governed old-to-new assignment exchange for the
availability-conflict workflow. The coordinated replacement enhancement below
adds one-decision coverage for every assignment affected by one availability
period. Remaining workforce recovery includes dependency-aware schedule
reflow, conditional capacity and shared-resource optimization, and hosted
PostgreSQL proof for these new paths.

## 2026-09-24 - Coordinated workforce replacement plan

One availability period can now produce a complete replacement plan across
multiple jobs. The operator selects one currently eligible replacement for
every affected assignment and submits one operational reason. A single
portfolio-level approval retains the original snapshots and proposed
assignments. Nothing changes on submission. Before approval, the ledger checks
that the complete affected set is unchanged, the period remains active, every
original assignment and proposal is unchanged, no worker is checked in, all
replacement workers remain available and qualified, and no selected worker is
assigned overlapping work elsewhere in the plan. All releases and activations
run in one transaction. Rejection leaves existing coverage untouched, and
re-submitting the exact same pending plan is idempotent.

The resources dashboard exposes this as one responsive form for periods with
multiple conflicts. Existing single-assignment swaps remain available. The
approval queue shows the complete job-by-job worker change and its safeguards.
No external messages, client notifications, supplier orders, or schedule
commitments are issued.

| Gate | Verified result |
| --- | --- |
| Focused Node tests | 13 ledger/API tests passed across availability, individual replacement, coordinated plan approval, idempotent replay, rejection/stale-state rollback, and API resolution. |
| Frontend | 67 tests across 19 files passed. |
| Browser | New Chromium workflow passed for one absence affecting two separate jobs, one approval, and 390px mobile width. |
| Lint/build/bundle | Changed JavaScript lint passed; Vite production build passed. Total gzip measured 549,796 bytes. The total budget is now 551,000 bytes (a 2,000-byte allowance for the added coordination flow); individual asset caps are unchanged. |
| Hosted DB | PostgreSQL is not configured in this environment; latest coordinated transaction proof uses isolated SQLite. |
| Operator data and publication | The local operator database was not touched. No commit, push, deployment, provider action, or customer communication occurred. |

## 2026-09-24 - Material-aware work-plan scheduling

Work-plan tasks can now link only to material requirements retained on the same
job. A linked shortfall with no expected-availability date blocks calculation
and baseline approval. The office can record zero or partial stock and, when
available, a referenced expected delivery/availability date. An estimate moves
that task to no earlier than the ETA and flows through its finish-to-start
dependants. The calculated internal plan clearly labels estimated availability;
it never places an order or creates a supplier or customer commitment.

Material quantity, task links, expected date, and evidence reference are part of
the planning hash, so edits after a baseline request make its approval stale.
Cross-job links and unreferenced estimates are rejected. Supplier delivery
reliability is now summarized from retained receipt history and shown in bid
comparison, but it does not yet calculate supplier lead-time risk, split-delivery
forecasts, substitutions, or transport risk. The internal work plan still does
not reserve shared inventory across jobs.

| Gate | Verified result |
| --- | --- |
| Focused Node/API regressions | 12 tests passed, including shortage blocking, ETA schedule propagation, stale approval rejection, cross-job link rejection, material receiving, dispatch, and inventory readiness. |
| Frontend | 67 tests across 19 files passed. |
| Browser | Work-plan approval flow and linked-material shortage flow passed in Chromium; the shortage cannot request a baseline. |
| Lint/build/bundle | Changed JavaScript passed ESLint; Vite production build passed. Gzip bundle measured 550,647 bytes against the 551,000-byte total budget; per-asset budgets passed. |
| Deployment and external effects | Hosted PostgreSQL is not configured. No purchase order, supplier contact, customer promise, commit, push, deployment, or change to the local operator database occurred. |

## 2026-09-24 - Impact review to governed variation draft

A current retained change-impact analysis can now seed one formal variation
draft. The operator must enter the proposed scope and net price and confirm the
calendar-day impact separately; elapsed-hour estimates are not converted into
contract days or customer pricing. The formal variation snapshot includes a
reference to the exact retained analysis and its source hash. A changed source,
invalid audit chain, incomplete schedule analysis, or mixed-currency review
blocks preparation. Exact request retries replay; a second distinct variation
from the same analysis is rejected.

The resulting draft creates an internal approval but does not issue a client
package, send communication, alter the contract, place an order, or authorize
work. Existing separate gates for internal approval, client-package approval,
verified delivery, and verified client acceptance remain authoritative.
The analysis currentness check accounts for its own linked variation and the
derived internal approval flag; other dossier changes still make it stale.
This does not yet automatically reconcile detailed scope quantities, rates,
materials, purchase orders, resource conflicts, or contract working calendars;
the operator must review those links before approval.

| Gate | Verified result |
| --- | --- |
| Focused Node/API/security/regression | 24 tests passed across change-impact review, role boundaries, formal variation snapshot integrity, and issue-package/acceptance controls. |
| Browser | Full contractor dossier-review path passed: retain analysis, prepare a priced variation draft, verify current source/approval status, and check mobile layout and accessibility. |
| Lint/build/bundle | Changed JavaScript passed ESLint; Vite production build passed. Total gzip was 551,654 bytes; the aggregate limit was adjusted from 551,000 to 552,000 for the governed variation authoring flow. Individual asset budgets remain unchanged and passed. |
| Hosted/external effects | PostgreSQL and live messaging are not configured. No issue package, external message, client commitment, work release, commit, push, deployment, or operator-database change occurred. |

## 2026-09-24 - Accepted scope changes in the field work pack

The assigned worker's current work pack now includes the exact scope text,
numbered revision, title and acceptance time for integrity-valid accepted
formal variations. It deliberately excludes variation prices, cost codes,
commercial justification, risk statements and portal evidence references.
Draft, internally approved, issued-but-unaccepted, rejected and superseded
changes do not appear as authorized field scope. If an accepted record no longer
matches its immutable snapshot, the scope text is withheld and the pack flags an
office review. Adding, changing or withholding an accepted scope revision
changes the work-pack source hash and invalidates the worker's previous read
confirmation.

This is scope context, not a schedule or assignment mutation: work tasks,
materials, worker assignments and dates must still be prepared and approved
through their own workflows. The work-pack banner explicitly directs the worker
to contact the office if those instructions do not match the accepted scope.

| Gate | Verified result |
| --- | --- |
| Node/API/integrity | 29 focused tests passed across field packs, role enforcement, formal variations, issue packages, and dossier review. They verify accepted-only filtering, private commercial-field exclusion, acknowledgement invalidation, draft exclusion, and withholding tampered scope. |
| Restore regression | 73 API, integrity, and backup/restore tests passed, including migration 058 formal-variation schema verification. |
| Frontend/browser | 68 frontend tests passed. The named-worker browser flow passed on mobile with accessibility checks. Component tests verify scope is context and does not claim tasks or dates changed. |
| Lint/build/bundle | Repository ESLint passed. Production build passed; measured total gzip is 552,040 bytes. The aggregate budget is now 553,000 bytes to cover the variation authoring and field-scope context paths; per-asset limits are unchanged and passed. |
| Integration boundary | Field work packs remain assignment-scoped; only the worker's existing job work instructions are included. No pricing, external action, schedule promise, or automatic work release was added. |

## 2026-09-24 - Accepted scope to reviewed execution tasks

An office operator can now break an integrity-checked, client-accepted formal
variation into up to 30 open work steps and 100 linked material needs. The
request binds the exact accepted revision, verified client issue package and
delivery receipt, an idempotency key, a plan checksum, and the current job task,
material, and dependency state. Approval is a separate decision and must come
from another authenticated operator when authenticated roles are enabled.

Approval creates only unassigned open tasks and `needed` material records linked
to their originating task. It does not set task dates, assignments, dependency
links, material suppliers, prices, required-by dates, purchase orders, external
messages, or client/schedule commitments. Stale source evidence, changed job
operational state, tampering, and changed retries fail closed. Rejected requests
create no work or material records.

| Gate | Verified result |
| --- | --- |
| Variation workflow | Three focused Node tests cover exact acceptance-chain checks, approval effects, linked material creation, replay, changed-state blocking, tamper blocking, separation of duties, no schedule/assignment/order, and audit integrity. One API test verifies office-write access and denies unauthenticated, field-worker, and approver writes. |
| UI | Two component tests cover drafting and submission of task/material details and suppressing the action for unaccepted or integrity-invalid variations. |
| Regression | Full frontend suite passed 70/70; repository ESLint passed. Full Node run produced 673 passes and one stale browser-inventory count failure (expected 122, discovered 124); the count was corrected and its focused static tests then passed. 46 PostgreSQL-dependent tests were skipped because no test database is configured. |
| Build and size | Vite production build passed. Gzip assets measured 553,970 bytes; the aggregate cap is now 555,000 to include the reviewed variation-to-task/material path. All per-asset budgets remain unchanged. |
| External boundary | No business database, live provider, production host, commit, or push was used. This feature does not independently assign the created tasks or place the listed materials. |

## 2026-09-24 - Approved variation tasks enter the reviewed work board

The office work-board suggestions now recognize tasks created by an approved
variation implementation plan and show only their linked material needs. These
needs are marked as requiring delivery confirmation; unrelated job materials
are not silently added to the position. The draft pre-fills task title,
description, location and duration, but leaves role, dates and rate for office
review. Publication still requires complete position terms and an explicit
release confirmation.

Both suggestion and publication now verify that the task and its linked
materials still match the approved plan, that the plan checksum is intact, and
that the client acceptance and current variation snapshot remain valid. The
publication-time check also detects a task whose source metadata was altered
after the form was opened. A stale or tampered task is withheld or rejected;
worker enrollment and existing qualification, availability and capacity checks
remain unchanged.

| Gate | Verified result |
| --- | --- |
| Node regression | 11 variation, work-board and API tests passed, including publication after suggestion and rejection after source-task tampering. |
| Frontend/lint | Full frontend suite passed 71/71; repository ESLint passed. |
| Build and size | Vite production build passed. Aggregate gzip measured 554,014 bytes against the 555,000-byte cap; individual bundle budgets passed. |
| External boundary | No position is auto-published. No business database, live provider, production host, commit or push was used. |

## 2026-09-24 - Conditional standby capacity reaches worker enrollment

Admitted workers can now retain a generic time-bounded standby window without
storing a health, care, or other personal reason. Standby is distinct from
unavailability: it remains visible in worker-capacity summaries but does not
block normal schedule checks or invalidate an existing assignment. If a worker
applies for an overlapping position, the application remains interest instead
of creating an automatic planned assignment. The office view names the hold,
and only an explicit owner confirmation can place the worker after the normal
current capacity, admission, role, credential, work-readiness, conflict, and
hard-unavailability checks run again.

| Gate | Verified result |
| --- | --- |
| Node/API | Full Node suite passed 678 tests; 46 PostgreSQL-dependent tests were skipped because no test database is configured. Focused workforce-availability, work-board and API tests passed 21/21. |
| Frontend/browser | Full frontend suite passed 76/76. Worker portal and owner dashboard browser flows passed 2/2, including mobile overflow/accessibility checks. |
| Lint/build/size | Repository ESLint and Vite production build passed. Aggregate gzip measured 556,335 bytes against the updated 556,500-byte total budget; all per-surface budgets passed. |
| External boundary | No real operator database, provider, production host, deployment, commit or push was used. Standby does not create a customer commitment or notify the worker of a call-out. |

## 2026-09-24 - Standby no longer appears as guaranteed replacement capacity

The availability register previously excluded standby periods from hard
unavailability checks, as intended, but the replacement planner reused that
same query to suggest replacements. That could make a worker who had only
signalled conditional availability appear immediately placeable. Timed standby
windows now remain outside the absence/blocking state while overlapping
workers are omitted from replacement suggestions. Both single-assignment and
coordinated replacement approval revalidate this condition; a standby window
added after a proposal leaves all assignments and the pending approval
unchanged. Worker records using the separate general `standby` status are not
the same as a time-bounded standby window and retain their existing review
semantics.

| Gate | Verified result |
| --- | --- |
| Node | Full Node suite passed 679/725; 46 PostgreSQL-dependent tests were skipped because no test database is configured. Workforce availability tests verify conditional workers are excluded from replacement choices, rejected if submitted directly, and invalidate a stale replacement proposal at approval without changing assignments. |
| Frontend/browser | Frontend suite passed 76/76. All three workforce-availability browser flows passed, including the exclusion of an overlapping timed standby worker and selection of a different replacement. |
| Lint/build/size | Repository ESLint and Vite production build passed. Aggregate gzip measured 556,343 bytes against the 556,500-byte total limit; per-surface asset limits passed. |
| Interface | The recovery panel explains that overlapping on-call windows are excluded and that planning, approval, safety and dispatch checks still apply. |
| Remaining boundary | No worker call-out notification or self-confirmation workflow exists yet; standby alone is not treated as consent. No production data or provider was used. |

## 2026-09-24 - Worker-reported unavailability reaches crew planning

Admitted field workers can report when they are unavailable from the worker
portal, including a return date that is not yet known (with a review date).
The form does not ask why. Only a generic operational absence and its time
window are retained. Reports are scoped to the worker linked to the current
legacy session or reviewed company identity; unadmitted applicants cannot use
the route. Matching active assignments are shown to the worker and flow into
the office availability register, where the existing replacement planner
checks role, schedule, qualifications and capacity. The report never replaces
or releases an assignment, and no substitute is committed before approval.

| Gate | Verified result |
| --- | --- |
| Node/API | Full Node suite passed 676 tests; 46 PostgreSQL-dependent tests were skipped because no database is configured. Focused work-board and identity API tests verify own-worker scope, admission, spoofed worker IDs, idempotent replay, conflict reporting and privacy-safe fields. |
| Frontend/browser | Frontend suite passed 74/74. The mobile worker registration-to-assignment browser flow also verified conflict reporting and the approval boundary. |
| Lint/build/size | Repository ESLint and Vite production build passed. Aggregate gzip is 555,632 bytes under the 556,000-byte budget; all per-asset budgets passed. |
| External boundary | No operator database, live provider, deployment, commit or push was used. |

## 2026-09-24 - Material-ready worker placement

Positions linked to task material requirements now distinguish signing up from
being placed. Applicants may express interest while materials are missing, but
the application does not reserve capacity or create an assignment. The worker
portal states this clearly, and the office view lists the exact linked blockers
and current applicant admission state.

Placement can proceed automatically after an admitted worker explicitly enrolls
once every linked requirement has a ready status and verified available
quantity at least equal to the required quantity. Alternatively, the owner can
confirm a pending application in the dossier after receipt is recorded. That
action rechecks active position terms, task source integrity, material quantity,
worker status, trade, qualifications, availability, schedule conflicts and
remaining capacity. Confirmation is transactionally idempotent. Existing
dispatch/start readiness remains an independent later gate if material state
subsequently changes.

| Gate | Verified result |
| --- | --- |
| Node/API | Full Node suite passed 676 tests; 46 PostgreSQL-dependent tests were skipped because no database is configured. Work-board tests cover missing and partial receipts, owner confirmation, audit and duplicate confirmation; API tests verify owner-only confirmation. |
| Frontend | Full suite passed 73/73. Worker messaging and owner confirmation controls have focused component coverage. |
| Lint/build/size | Repository ESLint passed. Vite production build and bundle verification passed at 554,560 gzip bytes against a 555,000-byte aggregate limit. |
| External boundary | No position is auto-published; no unready material-linked position creates an assignment. No business database, provider, deployment, commit or push was used. |

## 2026-09-24 - Absence and material impact meet in availability planning

The office availability register now joins each retained worker-assignment
conflict to the job's active work plan and material requirements. It exposes
verified available quantity, remaining shortfall, directly linked work steps,
and any material blockers in the current schedule calculation. The receiving
register keeps the same source-derived impact on discrepant receipts, including
after autonomy has prepared an internal review task. The contractor can compare
replacement options with material readiness without treating a replacement
proposal as permission to dispatch.

| Gate | Verified result |
| --- | --- |
| Node/API | Focused worker-availability and material-receiving ledger/API suites passed, including a combined absence plus short-delivery fixture. |
| Frontend/browser | Material impact component test passed. All three workforce-availability Chromium flows passed, including the combined material shortfall and blocked plan on desktop/mobile checks. |
| Lint/build/size | Targeted ESLint and Vite production build passed. Bundle verification passed at 557,998 gzip bytes of the existing 558,000-byte limit. |
| Remaining boundary | Impact is a source-derived snapshot, not a persistent cross-company incident case or feasible resource optimization. No explicit client-date commitment is inferred from a planned date. Recovery ownership, client communication/acknowledgment, supplier action, cross-job stock reservations and final verified resolution remain separate work. PostgreSQL and live-provider acceptance were not run. |
| External boundary | No provider, operator database, deployment, commit or push was used. |

## 2026-09-24 - Shared operational recovery case

Migration `084_operational_recovery_cases` adds a durable office-owned case that
can link current worker-availability conflicts, discrepant material receipts and
unresolved safety reports without collapsing their distinct source registers.
The case retains its responsible person, explicit follow-up date, selected
recovery direction and source-derived schedule/material effects. A source change
blocks stale updates and marks the case for review. Closing requires recorded
recovery evidence. The dossier now exposes this workflow to owners and office
operators; field roles and approvers cannot read or change it.

The record calls out customer-commitment review before any date change. It does
not send customer messages, contact suppliers, place orders, change worker
assignments, or alter the baseline schedule. Planned dates are not treated as
client promises. This is an owned coordination case, not an optimizer or proof
that the proposed recovery is feasible.

| Gate | Verified result |
| --- | --- |
| Ledger/API | Focused tests cover one case combining absence and short delivery, retained schedule/material impact, replay idempotency, stale-source rejection, required close evidence, checksum failure and owner/office-only route access. |
| Frontend | Targeted tests cover source selection, identical retry after an unknown result, impact visibility and escaped source text. |
| Persistence/release | SQLite migration 084 and export are wired; hosted migration JSON is retained as immutable source data; local backup inspection verifies schema, index and record integrity. The production container test passed with non-root/read-only/loopback/authenticated runtime, restart persistence, graceful shutdown and migration 084. The Windows standalone verification passed with migration 084, no pending migrations and identity/backup-restore checks. PostgreSQL integration still requires a configured test database. The aggregate gzip cap is 561,200 bytes (up 3,000 for the new recovery interface); individual surface limits are unchanged. |
| Quality gates | Complete Node suite passed; frontend suite passed 81/81; lint, production build and bundle verification passed (561,005 gzip bytes of 561,200); the operational-recovery browser flow passed; static-performance and recovery API/ledger tests passed. |
| External boundary | No message, supplier action, assignment, commitment, provider, deployment, database mutation outside test fixtures, commit or push was performed. |

## 2026-09-24 - Field progress from the native work pack

The Android work-pack source now records execution progress or an explicit
blocker against the assigned worker's current instructions. The report enters
the existing ledger progress history and can be retained in the encrypted
offline queue before synchronization. Replays are idempotent, changed content
cannot reuse a key, and field accounts cannot close a job. Job/task execution
status no longer invalidates the work-pack instruction hash by itself; changed
instructions, scope, schedule, qualifications or resources still do.

| Gate | Verified result |
| --- | --- |
| Ledger/API | Work-pack, progress replay and API scope tests passed (10/10), including wrong-role, wrong-job, invalid value, stale retry and completion refusal. The complete Node suite and repository lint passed. |
| Browser/release | Mobile field-work-pack Chromium workflow passed; release-contract scan passed. |
| Native boundary | Android Java source and the offline queue were updated, but no APK build, emulator or phone installation could run because this environment has no JDK/Gradle/Android SDK. Native release remains unaccepted. |
| External boundary | No provider, deployment, commit or push was used. |

## 2026-09-24 - Customer findings enter governed project follow-up

Current local conversation analysis can now be turned into an internal RFI by
an authorized office user. The user reviews and can edit the RFI title/question,
sets its owner and due date, and retains the exact client message, source quote,
analysis identity, model proposal and uncertainty as provenance. The API
rechecks the active portal conversation, current analysis and inbound quote
inside the ledger transaction. Identical retries return the same RFI; changed
payloads under that key and stale source analyses fail closed. This creates only
internal follow-up: no client communication, accepted scope, spend, assignment or
schedule commitment is produced.

| Gate | Verified result |
| --- | --- |
| API/domain | Conversation-analysis and source-linked RFI route tests passed (9/9), using a loopback model fixture. Coverage includes office/field role boundaries, current source, quote provenance, exact replay, changed payload and a conversation changed after analysis. |
| Frontend | Full component suite passed 82/82; focused workflow test verifies operator review and source-bound API submission. |
| Quality gates | Full Node suite, ESLint, Vite production build and release-contract verification passed. |
| Remaining boundary | The enabled local model's interpretation quality is not accepted; live model/vision, WhatsApp/Meta, hosted PostgreSQL and EU deployment remain separate. No commit or push was performed. |

## 2026-09-24 - Incident follow-up is owned and evidenced

Incident reports can retain an office-assigned follow-up owner and due date in
the existing field-risk register. Field workers cannot assign office ownership
or set that deadline through the incident API. Before an office operator can
request incident resolution, the transition must include a review note and a
documented corrective action; high-risk resolution remains approval-gated. The
retained incident exposes its owner, deadline and approved corrective action.
This strengthens incident closeout but does not yet create one cross-domain
case for absence, short delivery, schedule impact, supplier recovery and client
commitment changes.

| Gate | Verified result |
| --- | --- |
| Node/API | Full Node suite passed. Focused lifecycle, incident replay, field-assurance and role-authorization tests passed. Current-version assertions now follow migration 083; PostgreSQL provider-backed checks still require a configured test database. |
| Frontend/browser | Frontend suite passed 79/79. The offline incident reporting browser flow passed. |
| Lint/build/size | Full ESLint, Vite production build and bundle check passed. Total gzip is 558,167 bytes against the explicitly adjusted 558,200-byte cap; per-surface caps are unchanged. |
| Remaining boundary | No incident-triggered client communication, supplier action, cross-job optimization, external reporting or automatic work release was enabled. Resolution still requires a human approval for high-risk incidents. |
| External boundary | No provider, operator database, deployment, commit or push was used. |

## 2026-09-24 - Customer-impact reviews use retained conversation evidence

An office user reviewing an approved appointment affected by an absence must
select an actual incoming message from an active, approved portal conversation
for that appointment's job. The command verifies the appointment/case version,
conversation access, message direction, owning job and immutable message hash.
The retained review stores the exact message identity, hash, timestamp and a
bounded excerpt; tampering with the referenced audit source fails the recovery
integrity check. Later incoming conversation changes alter the recovery source
fingerprint, requiring an explicit fresh review. Existing historical free-text
references remain readable, but new reviews cannot use a typed citation as proof.

| Gate | Verified result |
| --- | --- |
| Ledger/API | Focused operational-recovery ledger and role-bound API tests passed (11/11), including exact replay, invented-message rejection, source refresh, retained-message tamper detection and unchanged appointments/communications. |
| Frontend/browser | Operational-recovery component tests passed (5/5). All four Chromium recovery workflows passed, including the actual client portal message, desktop/mobile rendering and accessibility checks. |
| Quality gates | Repository ESLint, Vite production build, release-contract check (93 canonical paths) and bundle verification passed. Aggregate gzip is 568,422 / 570,800 bytes; the client-appointment component is 2,017 / 2,100 bytes after its evidence-selector budget was raised 100 bytes. |
| Remaining boundary | This is evidence-linked appointment recovery, not a contract commitment register. Planned dates and chat text are not promoted automatically to contractual completion commitments. No message was sent, no appointment was moved, and no external service was contacted. |
| External boundary | No deployment, provider action, commit or push was performed. |

## 2026-09-24 - Contractual customer dates are explicit and source-bound

The commercial dossier now has an append-only register for customer-facing
contract dates. An office user records a start date, milestone deadline or
completion deadline against a currently accepted quote or formally accepted
change order. The server verifies the source's accepted state and its exact
approved acceptance record. The user also retains the precise contract wording
and a document/page reference; this is provenance, not a legal review. Each
milestone can be revised or withdrawn without overwriting its prior record.
Internal target dates, calculated schedules, client chat and AI analysis are
not accepted as contract sources. Recording a commitment leaves the schedule
and customer communication untouched. Current commitments are included in
operational-disruption source snapshots, so previously open recovery cases
become stale and need explicit reassessment if the register changes.

| Gate | Verified result |
| --- | --- |
| Ledger/API | New client-date domain and authenticated API tests passed, alongside operational-recovery regression tests (14/14). They cover source verification, target-date separation, exact replay, changed-source rejection, audit-chain validity and office/owner/approver/field role boundaries. The complete Node suite passed: 698 passed, 46 optional provider-backed tests skipped, 0 failed. |
| Frontend/browser | Focused register interaction and read-only tests passed (2/2); the complete frontend suite passed serially (87/87). The Chromium contract-date workflow passed on desktop and mobile, including the responsive overflow check. Parallel frontend execution had resource-related 5-second timeouts, so the verified full run used one worker. |
| Quality gates | Repository lint, production build and release-contract verification passed (99 canonical paths). Bundle verification passed at 571,400 gzip bytes against 573,500; the contract-date screen is 2,512/2,700 bytes and operational recovery is 3,346/3,400 bytes. |
| External boundary | No deployment, provider action, commit or push was performed. PostgreSQL provider-backed execution remains dependent on a configured test database. |

## 2026-09-24 - Contract dates receive a disruption impact review

Open office recovery cases can now retain an impact assessment against one
specific current contract milestone: not affected, at risk, or a decision is
needed. At-risk and decision-needed assessments require a dated follow-up. Each
record stores the exact accepted contract revision and wording, its evidence
reference, and the source fingerprints for every linked disruption. Replaying an
uncertain request uses the same command key. A changed disruption or contract
revision makes earlier assessments historical and requires the recovery case
and impact to be reviewed again. Assessment does not change the contract,
internal target date, schedule, customer message or appointment.

| Gate | Verified result |
| --- | --- |
| Ledger/API | Domain and role-bound API tests cover current-source enforcement, invalid and stale contract hashes, required follow-up, exact replay, revised-contract reassessment, unchanged target dates, audit-chain evidence and tamper detection after recomputing the mutable snapshot checksum. |
| Frontend/browser | All 89 frontend tests passed serially. The production-bundle Chromium flow passed from an accepted quote through a live recovery case to a recorded impact review; it verified the retained contract wording, unchanged internal target and mobile horizontal fit. |
| Quality gates | Complete Node suite passed: 699 passed, 46 optional PostgreSQL provider tests skipped, 0 failed. All 89 frontend tests passed serially. Repository lint, production build, release-contract scan (101 canonical paths) and bundle verification passed. Aggregate gzip is 573,217/573,500 bytes; contract-impact review is 1,916/2,200 bytes. |
| External boundary | No client or supplier message was sent, no date or assignment was changed, and no deployment, provider action, commit or push was performed. |

## 2026-09-24 - Recovery links disruptions to schedule and contract milestones

Each active disruption now carries a source-fingerprinted schedule signal in
the recovery workspace. The signal uses an approved baseline only while that
baseline still matches the current work plan. It identifies linked impacted
tasks, whether those tasks intersect the critical path, and whether the current
internal baseline ends on/before or after a source-current contract milestone.
Stale or missing baselines and unlinked tasks remain explicitly incomparable.
This is not a delay forecast: it does not estimate recovery duration, make a
new contractual promise, or change dates, assignments, communications, or the
approved plan. The signal is retained with recovery cases for auditability;
changes to the plan make the recovery source stale and require reassessment.

| Gate | Verified result |
| --- | --- |
| Ledger/API | Full Node suite: 700 passed, 46 optional PostgreSQL-backed tests skipped, 0 failed. After the final retained-snapshot correction, all 17 focused client-date and recovery tests passed. They cover current/stale baseline state, critical-path overlap, contract comparison, source freshness and recovery snapshot retention. |
| Frontend/browser | Full frontend suite: 89/89. The focused production-bundle Chromium flow passed 2/2; it verifies visible comparisons, the incomparable state without an approved baseline, and responsive contract-impact review. |
| Quality gates | ESLint and Vite production build passed. Release-contract scan passed (101 canonical paths). Bundle is 573,667/574,000 gzip bytes; operational-recovery UI is 3,663/3,800 bytes. `git diff --check` passed; Git reported only existing LF/CRLF normalization warnings. |
| Remaining boundary | The impact classification is evidence for human review, not an autonomous reschedule, duration forecast, legal interpretation, or customer-facing promise. No provider, deployment, commit, or push action was performed. |

## 2026-09-24 - Task-linked field progress reaches recovery planning

Online work packs, the encrypted offline web queue and the Android source app
now require a worker to select one currently open task when reporting progress
or a blocker. The task ID is retained with the exact work-pack revision and
idempotency key. On sync, the ledger rechecks worker assignment, task visibility,
task state and work-pack freshness. Completed or foreign tasks are rejected.
Task reports remain evidence for office review; they do not change job-wide
status/progress, complete work or clear a safety hold. A blocker now carries its
task into operational recovery, where the existing schedule projection can show
the linked task and critical-path classification when the schedule data permits.

| Gate | Verified result |
| --- | --- |
| Ledger/API/offline | Full Node suite: 702 passed, 46 optional PostgreSQL-backed tests skipped, 0 failed. After the final open-task validation refinement, the 14 focused field-pack, replay, API and encrypted-offline tests passed. They verify task ownership, open state, idempotent retries, schedule projection and unchanged job-level progress/status. |
| Frontend/browser | All 90 frontend tests passed serially. The production-bundle mobile Chromium flow passed and checked that a task blocker reaches office recovery with the linked schedule task, while overall job status/progress remain unchanged; existing accessibility, offline, and responsive assertions also passed. |
| Quality gates | ESLint, production build, release contract (101 canonical paths) and bundle check passed. Aggregate gzip is 574,458/575,000 bytes; the total budget increased by 1,000 bytes for the connected task-reporting path. `git diff --check` passed; Git emitted only existing LF/CRLF normalization warnings. |
| Remaining boundary | Android source was updated but not compiled or installed because Android SDK 35/JDK/Gradle prerequisites are not available in this environment; no SDK terms were accepted. No deployment, provider action, commit or push was performed. |

## 2026-09-24 - Field-blocker closure requires verified task resumption

An office user can no longer close a task-linked field blocker with only a
free-text recovery note. The blocker now carries its task and worker identity
through the immutable field-progress audit entry. A later `in_progress` report
from that same worker on that same task becomes selectable closure evidence.
That new report changes the source fingerprint, so an open recovery case first
becomes stale and requires an explicit office reassessment. The closure stores
the selected progress ID, task, worker, timestamp and source hash alongside
the office's recovery evidence and an append-only audit event. Integrity checks
cross-check that immutable event, so recomputing the mutable snapshot checksum
cannot forge or replace the selected worker report. Other disruption types retain their existing
resolution path; existing historical text-only closures remain readable and
are classified as legacy rather than falsely presented as worker-verified.

| Gate | Verified result |
| --- | --- |
| Ledger/API | Full Node suite passed: 702 passed, 46 optional PostgreSQL provider tests skipped, 0 failed. Focused recovery domain tests also passed (10/10), including free-text-only rejection, same-worker/task evidence, stale-source rejection, reassessment, closure, replay and tamper rejection after an attacker recomputes the mutable snapshot checksum. |
| Frontend/browser | Full frontend suite passed (91/91); focused recovery interactions passed (6/6). Production-bundle Chromium recovery tests passed (4/4). The end-to-end field-blocker flow refreshes the changed source, reassesses it, selects the worker's exact resumption report and closes with retained evidence. |
| Quality | ESLint, release-contract scan (101 canonical paths), production bundle build and bundle budget passed. Aggregate gzip is 574,814/575,000 bytes; operational recovery is 4,038/4,100 bytes. |
| Compatibility and boundary | Existing resolved cases without task-resumption records remain readable as legacy text-only closure evidence. No external communication, task completion, schedule change, deployment, commit or push was performed. |

## 2026-09-24 - Workers can withdraw unplaced position interest

The worker portal now lets the authenticated applicant withdraw their own
`interested` application. The record is retained as `withdrawn`, its position
capacity remains available, and the audit trail records the transition. A
withdrawn application can be submitted again while the position remains open;
the normal admission, source, material, qualification, availability and
capacity checks run again. The endpoint refuses assigned applications, so it
cannot silently release a crew member or alter a job assignment. For an
existing placement, workers continue to report availability and office follows
the separate review and approval path.

| Gate | Verified result |
| --- | --- |
| Ledger/API | Focused work-board ledger and authenticated API tests passed (11/11); they cover account scoping, duplicate withdrawal, retained audit history, open capacity, re-enrollment and rejection of silent cancellation after assignment. |
| Frontend/browser | Focused worker call-out/interest UI tests passed (2/2). Production-bundle Chromium work-board workflows passed (2/2), including mobile registration, admission, enrollment, withdrawal, responsive layout, accessibility and office controls. |
| External boundary | Withdrawal sends no notification, changes no existing assignment and makes no customer commitment. No production data, provider, deployment, commit or push was used. |

## 2026-09-24 - Assigned workers report task progress and blockers in the portal

The signed-in worker portal now accepts a progress or blocker report for an open
task in the worker's active assigned work pack. The server binds the authenticated
worker and position, rechecks the assignment and current work-pack source, and
retains the exact task and idempotency key through the existing field-progress
ledger. Blockers flow into office operational recovery. These reports do not
complete tasks, update job-wide progress, clear stop-work conditions or authorize
work to start.

| Gate | Verified result |
| --- | --- |
| Ledger/API | Authenticated work-board API test passed for an assigned worker; another account cannot report against that position. Reports retain the task ID and current source hash. |
| Frontend/browser | Full frontend suite passed (95/95). Production-bundle mobile work-board Chromium tests passed (2/2), including blocker submission from the assigned pack and verification that the same blocker appears in office recovery. |
| Quality and boundary | ESLint and production build passed; bundle budget is 575,850/576,000 gzip bytes. No customer notification, task completion, production data, provider, deployment, commit or push was used. Offline capture remains in the separate field app; this portal increment is online-only. |

## 2026-09-24 - Android field app gains governed offline photo capture source

The Android source now reads the exact server session company/ledger/worker
identity, refuses vault reuse under another scope, and sends company headers on
requests. Assigned photo sets expose their next required phase; camera images are
temporarily shared through a non-exported FileProvider, normalized to a bounded
JPEG with EXIF/GPS metadata removed, then queued inside the existing AES-GCM
Android-Keystore vault. Reconnection uses the governed private upload endpoint,
company scope and a stable idempotency key. Successful phases update the local
snapshot; 409s remain visible and are never silently reattached. Office review is
still required before evidence releases a task gate.

| Gate | Verified result |
| --- | --- |
| Server/API | Existing governed photo API test passed; it verifies assignment scope, private upload, chronological phases, idempotency and separate approval. Existing browser offline photo tests remain browser-client proof, not Android camera proof. |
| Source contract | Release-contract tests assert the native session projection, company headers, FileProvider cache boundary, ordered phase queue and governed multipart/idempotency path. These are source checks, not Java compilation. |
| Build/device | No Android SDK, JDK or Gradle installation was found in environment variables, common install paths or Gradle wrapper cache. APK build, emulator run, camera integration and physical-device installation remain unverified; SDK license terms were not accepted. |

## 2026-09-24 - Field questions connect to approved office replies

Each online or synchronized field-work-pack question now creates a replay-safe
field report and a linked job RFI. Office staff can answer through the existing
RFI lifecycle; the answer remains private while approval is pending or rejected
and becomes visible to the originating worker only after the approval record is
approved. The general field job projection also filters work-pack RFIs to their
originating worker and redacts unapproved response text. Web/offline and native
Android snapshots retain the synchronized question; an approved answer arrives
after an online pack refresh. No notification or external message is sent.

| Gate | Verified result |
| --- | --- |
| Ledger/API | Field-work-pack domain, authenticated API and offline-vault suites passed (20 focused Node tests with release-contract checks). They verify RFI linkage, idempotent replay, office answer lifecycle, response secrecy during approval, release only after approval, and worker isolation. |
| Interface | Focused work-pack React tests passed (6/6), including hidden pending answer and visible approved answer. ESLint passed. |
| Native and release | Source-contract tests pass; no Android SDK/JDK/Gradle was available, so compilation/device behavior is not claimed. No provider message, notification, deployment, commit or push was performed. |

## 2026-09-24 - Field reply updates arrive without reloading the full work pack

The online field view now checks a dedicated, authenticated reply feed every 30
seconds while the view is visible and connected. It updates only the question
timeline, preserves the worker's current form state, and announces newly approved
answers through the accessible status region. The reply endpoint rechecks the
named worker's active assignment and returns at most 20 questions; pending or
rejected answer text remains withheld. The native Android view adds an explicit
online work-pack refresh control. No background push service or external message
was enabled.

| Gate | Verified result |
| --- | --- |
| Interface | Field work-pack React tests passed (7/7), including automatic receipt and announcement of a newly approved answer. The production-bundle mobile field-work-pack browser test passed (1/1), including narrow viewport, offline state and accessibility checks. |
| API/privacy | Focused field-pack, API and offline-vault tests passed (12/12), including reply-feed authorization, other-job denial, pending-answer redaction and approval-before-release. |
| Quality | ESLint, production build and release-contract validation are rerun for this increment; Android remains source-only without SDK/device compilation proof. No commit or push. |

## 2026-09-24 - Worker board updates while the positions page is open

The authenticated positions board now checks for personal application and
position changes every 30 seconds while its positions view is open, visible and
online. It announces newly available positions, standby call-outs, application
or waitlist changes, and revised or withdrawn position details in the page.
Polling stops when the worker leaves the positions view or the page is hidden;
offline periods are skipped, and an in-flight response is discarded if the
worker starts an action before that response returns. This is in-page polling,
not an installed notification subscription or background push channel.

| Evidence | Result |
| --- | --- |
| Focused worker board tests | 5/5 pass, including discovery of new positions and call-outs through polling. |
| Quality | ESLint passed; Vite production build passed; release-contract validation passed (101 canonical paths, 12 retired paths, 17 hosted environment keys, 628 source files); production-bundle worker-board browser tests passed (2/2). Focused worker-board React tests passed (5/5). Android remains source-only without SDK/device compilation proof. No commit or push. |

## 2026-09-24 - Stale work packages are clear to workers

When an open position's linked work package no longer matches its published
source, the worker board now explains that the contractor must reassess the
position and disables enrollment until a current release is available. This
avoids presenting a stale position as actionable and avoids a predictable
server conflict after a worker attempts to enroll. The API's existing source
hash and revision checks remain authoritative for enrollment and placement.
The office warning now names every affected position so the contractor can
identify which existing close-enrollment control to use. Closing preserves
existing placements; the owner can then publish a newly reviewed position.

| Gate | Verified result |
| --- | --- |
| Worker interface | Focused work-board and material/readiness suites passed (9/9), including a stale-source case that asserts the action is actually disabled and no enrollment request is sent. |
| Owner workflow | Office work-board tests passed (6/6), including a position-specific stale-source notice and closure that retains existing placement counts. |
| Quality | Full frontend suite passed (102/102); ESLint, production build, release-contract validation and production-bundle work-board browser tests passed (2/2). Android remains source-only without SDK/device compilation proof. No commit, push or deployment. |

## 2026-09-24 - Workers see enrollment blockers before applying

The worker portal now requests a read-only eligibility check before submitting
interest or placement. It explains an inactive or outdated position, role or
profile mismatch, mandatory qualification gaps, assignment overlap, and reported
unavailability without exposing unrelated job details. Pending admission,
unready linked materials, standby review and full capacity are advisories rather
than blockers when the existing workflow still permits interest or waitlisting.
The check is a point-in-time explanation only: enrollment and the contractor's
final confirmation continue to repeat the authoritative source, qualification,
availability and capacity checks.

| Gate | Verified result |
| --- | --- |
| Domain/API | Work-board domain and authenticated API tests passed (13/13), including pending-account interest, qualification and schedule blockers, unauthorized access and proof that the check creates no assignment. |
| Interface | Full frontend suite passed (103/103); focused work-board suites passed (16/16). The worker board displays returned blockers and suppresses enrollment submission until the worker retries after resolving them. |
| Quality | ESLint, Vite production build and release-contract validation passed (101 canonical paths); production-bundle work-board browser tests passed (2/2). Android remains source-only without SDK/device compilation proof. No commit, push or deployment. |

## 2026-09-24 - Worker-specific shifts travel with the work pack

Active assignment role, scheduled start/end and allocated hours are now part of
the worker-scoped work-pack projection. The online field view distinguishes
these shifts from the overall project schedule; the encrypted web offline view
and Android source view render the same details. Assignment changes affect the
source hash and invalidate an earlier read confirmation. Rates, costs and other
workers' assignments remain excluded.

| Gate | Verified result |
| --- | --- |
| Domain/API | Field work-pack domain/API tests passed (9/9); work-board API tests passed (2/2), including exact position-to-assignment linkage, schedule and allocated hours. Offline vault/drawing tests passed (5/5). |
| Interface | Full frontend suite passed (105/105); focused field work-pack and placement-workflow tests passed (8/8 and 6/6). Production-bundle field work-pack browser flow passed (1/1); worker-board browser flows passed (2/2). |
| Quality | ESLint, production build and release-contract validation passed (101 canonical paths, 12 retired paths, 17 hosted environment keys, 628 source files). Android remains source-only without SDK/device compilation proof. No commit, push or deployment. |

## 2026-09-24 - Trade requirements flow from tasks into worker positions

Office task creation now accepts an optional, bounded required-trade value.
The retained task exposes that explicit value to the work-board's position
suggestion, where selecting the task pre-fills the trade field. Unspecified
trades stay unspecified: the system does not infer qualifications from task
wording. Hours, rate, crew capacity, schedule and public wording still require
operator review and explicit release.

| Gate | Verified result |
| --- | --- |
| Domain/API | Full Node suite passed (710 passed, 46 optional provider/PostgreSQL tests skipped, 0 failed). After the final suggestion-completeness refinement, focused task-lifecycle and work-board tests passed (13/13); explicit task trade is retained, included in the task-derived position suggestion and constrained to 80 characters. |
| Interface | Variation-position prefill test passed (1/1); the worker-facing position terms remain subject to the existing explicit public-content review and release. |
| Quality | Full Node suite passed (710 passed, 46 optional provider/PostgreSQL tests skipped, 0 failed); full frontend suite passed (105/105). ESLint, Vite production build and release-contract verification passed (101 canonical paths, 12 retired paths, 17 hosted environment keys, 628 source files). No commit, push or deployment. |

## 2026-09-24 - Assignment-scoped safety dossier in field work packs

Online and encrypted offline work packs now show the active worker's linked
pre-task plan, hazards and controls, emergency arrangements, stop-work triggers,
linked permit details and only that worker's LMRA assessments and acknowledgement
status. The source hash includes these records. Other crew identities and LMRA
records are excluded. Status is described as dossier review only; the product
does not grant permission to start or a safety release. Android has matching
source changes but remains unbuilt and unverified on a device.

| Gate | Verified result |
| --- | --- |
| Domain/API | Work-pack, work-pack API, pre-task plan/API, work-permit/API, LMRA/API and encrypted offline-pack suites passed (30/30), including real linked permit/plan/LMRA records, worker scope, identity exclusion and source-hash invalidation. |
| Interface | Focused work-pack interface passed (9/9); full frontend passed (106/106). One standby-callout test failed transiently under full-suite load, then passed by itself and on the full rerun. |
| Quality | ESLint, Vite production build and release-contract verification passed (101 canonical paths, 12 retired, 17 hosted environment keys, 628 source files). Android could not be compiled: Java, Gradle and Android SDK are unavailable in this environment. No commit, push or deployment. |

## 2026-09-24 - Bounded resource-feasible work-plan preview

Added an isolated Z3 WebAssembly worker and a non-mutating resource-plan preview
for one job. It checks active task durations and explicit trades, existing
assignment windows, worker availability and qualification, recorded material
readiness, due dates, finish-to-start links and non-overlap for a worker across
the job's tasks. Inputs are read from one synchronous ledger snapshot; solving
happens outside that transaction with a 5-second solver limit, 7-second worker
limit, 32-task/24-worker bounds and at most four active preview workers. The
source hash binds the resulting suggestion to the inspected input snapshot.

This is an initial bounded workflow, not an automatically applied schedule or
a complete workforce optimizer. It only considers people already assigned to
the job and their recorded time windows; it does not model travel, working-day
calendars, crew/supervision requirements, conditional availability, cross-job
replacements or split shifts. It never changes customer commitments. The
proposal requires a different authenticated approver; application revalidates
the source hash, eligibility, windows, dependencies, due dates and non-overlap
inside the approval transaction, otherwise the approval remains pending and
no task is changed. Approved application updates task-level assignee, duration
and planned start/end; existing job-level crew assignment windows are retained.

| Gate | Verified result |
| --- | --- |
| Domain/API | Planner worker tests verify non-overlap, dependency ordering independent of task listing order and infeasible capacity; service tests verify an actual SQLite-ledger proposal, exact retry, independent approval, application and atomic stale-source rejection; API test verifies missing trade fails closed. |
| Interface | Proposal preview is separate from the elapsed-hour critical-path calculator, can be submitted to the approval queue, and labels advisory status, approval requirement, missing-input/conflict/timeout states and model limitations. |
| Quality | Full Node suite passed after the approval-application increment (717 passed, 46 optional provider/PostgreSQL tests skipped, 0 failed). Frontend suite, ESLint, Vite production build and release-contract verification are rerun for this increment. PostgreSQL parity and live hosted performance were not exercised. No commit, push or deployment. |

## 2026-09-24 - Resource gaps connect to worker self-enrollment

When a task has no currently assigned, qualified worker, the resource preview
now links directly to that job's existing open-position and applicant workflow.
The contractor can publish a reviewed position from the retained task, with
its trade and task details prefilled; public terms, rate, capacity and release
confirmation remain explicit. Workers still enroll themselves through the
worker portal, while admission, source/material readiness, qualifications,
availability, capacity and assignment-conflict checks remain in force. The
resource planner does not treat an applicant or open position as a confirmed
assignment; after an eligible worker enrolls and receives an internal planned
assignment, a fresh resource preview can schedule the work and still requires
independent approval before changing task allocations.

| Gate | Verified result |
| --- | --- |
| Browser workflow | Production-bundle work-plan browser suite passed (3/3), including a new end-to-end test from unstaffed task preview through the linked job position panel and task-derived role/description prefill. |
| Interface and quality | Full frontend suite passed (106/106); ESLint passed. Browser runner rebuilt the production bundle. Release-contract verification passed before this UI-only increment; no PostgreSQL, hosted deployment, public position release or external notification was exercised. No commit or push. |

## 2026-09-24 - Resource previews honor capacity-calendar working days

The resource planner now reads each currently assigned worker's active,
versioned crew-capacity profile and binds its effective date, IANA timezone,
weekday hours and source hash into the plan input hash. Time slots on weekdays
with zero retained hours, and slots before the profile's effective date, are
hard solver blocks. Approval revalidation therefore rejects a preview if the
capacity calendar changes before application. A focused SQLite integration test
covers a Saturday start and a Monday working-day placement in
Europe/Amsterdam. This does not yet constrain shift start/end times, split
tasks, travel, opening hours, or candidates without a capacity profile; the UI
must not describe it as an exact shift schedule.

| Gate | Verified result |
| --- | --- |
| Domain | Resource-planner tests passed (7/7), including non-working-day blocking and the existing approval/source validation flows. |
| Interface and quality | Full frontend suite passed (106/106); work-plan browser suite passed (3/3); ESLint and Vite production build passed. Release-contract verification passed (101 canonical paths, 12 retired paths, 17 hosted environment keys, 631 source files). No PostgreSQL parity, external calendar, deployment, commit or push. |

## 2026-09-24 - Resource plans constrain explicit local shift windows

Crew capacity profile version 2 retains a start and end time for each working
weekday, alongside the existing hours and IANA timezone. The profile snapshot,
hash and entry fingerprint include the windows; older version-1 day-only
profiles remain readable and keep their prior day-level behavior. The editor
requires a window for each day with positive capacity, offers half-hour
increments, clears times for zero-hour days, and localizes weekday and time
labels. The resource solver now blocks slots outside explicit windows in the
worker's timezone, including DST-aware local-time evaluation. A changed time
window invalidates a pending proposal before approval or application.

| Gate | Verified result |
| --- | --- |
| Domain/API | Crew-capacity, capacity API and resource-planner tests passed (12/12), covering v1 compatibility, v2 persistence/integrity, invalid or missing times, exact local shift placement and stale-plan rejection. |
| Interface | Crew-capacity component tests passed (2/2); combined production-bundle work-plan and capacity browser workflows passed (4/4), including editing weekday shifts, Dutch labels, approving a source-current capacity plan and checking mobile width/console errors. |
| Quality | Full Node suite passed (719 passed, 46 optional provider/PostgreSQL tests skipped, 0 failed); full frontend suite passed (108/108); ESLint, Vite production build and release-contract verification passed (101 canonical paths, 12 retired paths, 17 hosted environment keys, 632 source files). Split shifts and recorded break windows were outstanding at that verification point, as are travel, site opening hours, live hosted parity and Android device proof. No commit, push or deployment. |

## 2026-09-24 - Crew profiles support split shifts and explicit breaks

Crew capacity profile version 3 stores up to four ordered work intervals per
weekday in the existing integrity-checked snapshot format. Version 1 day-only
and version 2 single-window profiles remain readable and retain their existing
shape. The editor can add or remove intervals; the API rejects overlap,
out-of-order windows, invalid half-hour boundaries, insufficient total interval
time and intervals on zero-capacity days. The resource planner treats every
gap between intervals as unavailable and only accepts a task slot when the
entire slot lies inside one interval. It does not infer lunch times from a
region or contract, or split a task across an interval boundary.

| Gate | Verified result |
| --- | --- |
| Domain/API | Crew-capacity and resource planner tests passed (14/14), including v1/v2 compatibility, v3 persistence/integrity, malformed and overlapping interval rejection, insufficient work time, and pause-aware task placement. |
| Interface | Crew capacity component tests passed (2/2); production-bundle browser workflow passed (1/1), including editing split intervals, approving the source-current plan and checking mobile width and browser console. |
| Quality | Full Node suite passed (721 passed, 46 optional provider/PostgreSQL tests skipped, 0 failed); full frontend suite passed (108/108); full ESLint and Vite production build passed; release-contract verification passed (101 canonical paths, 12 retired paths, 17 hosted environment keys, 632 source files). Hosted PostgreSQL parity, live deployment and device-specific Android behavior are not claimed. No commit or push. |

## 2026-09-24 - Crew capacity profile drafts survive interruption

An open, unsaved crew-capacity profile is now retained in bounded,
operator-session-scoped browser draft storage. Returning to the same operator
session restores the selected worker and interval edits after a refresh or
component remount. The shared recovery hook now flushes its pending debounce on
the browser `pagehide` event, preventing fast navigation from dropping the last
input across every workflow already using that hook. Draft restoration is local
only: it does not call the save handler or write to the ledger. A successful
explicit save clears the draft through the existing editor close path. This
closes one form-recovery gap; it does not make every component form recoverable.

| Gate | Verified result |
| --- | --- |
| Interface and quality | Full frontend suite passed (110/110); focused production-bundle crew-capacity browser workflow passed (1/1), including reload and restored profile; ESLint and Vite production build passed. |

## 2026-09-24 - Resource planning respects verified site access hours

Each job can now retain an audited, revisioned weekly site-access calendar with
an IANA time zone, up to three intervals per weekday, explicit closed days, a
verification source and a source note. Office users configure it from the
work-plan control. Invalid time zones, missing weekdays, overnight/overlapping
intervals, unsupported sources and empty schedules are rejected. A resource
preview blocks every half-hour slot that is not wholly inside an access
interval; the full calendar is bound into the proposal source hash, so changes
invalidate pending proposals. Existing task schedules remain immovable and
will conflict rather than be shifted. If no calendar is recorded, the preview
labels site hours as unknown instead of inventing standard opening times.
At the verification point recorded below, travel duration between different
sites was not yet modeled.

| Gate | Verified result |
| --- | --- |
| Domain/API | Resource planner tests passed (11/11), covering timezone-aware placement, interval validation, idempotent saves and stale-plan rejection. |
| Interface | Production-bundle work-plan browser workflow passed (5/5); operators saved a sourced calendar and verified it in the ledger, with mobile overflow checks. |
| Quality | Full Node suite passed (724 passed, 46 optional provider/PostgreSQL tests skipped, 0 failed); frontend suite passed (110/110); ESLint and Vite production build passed. PostgreSQL hosted parity and live deployment were not exercised. No commit, push or deployment. |

## 2026-09-24 - Resource planning blocks sourced travel between assignments

Office users can retain a revisioned, bidirectional travel duration between
the current job and another job already assigned to the same worker. Both job
street addresses are snapshotted with the source type and verification note.
Travel before the other assignment and travel back afterwards are hard
half-hour planning blocks. A missing address, route or changed address blocks
the proposal; zero-minute travel is accepted only after explicitly confirming
that both normalized site snapshots are identical. Changing either address
invalidates the route and any earlier proposal through the existing
source-bound approval check.

This is recorded-route scheduling, not route calculation: the operator must
obtain and enter both directional durations. Home-to-first-job commute,
returning home, travel within one site, traffic prediction, and live maps are
not modeled. Those inputs must not be presented as measured travel times.

| Gate | Verified result |
| --- | --- |
| Domain | Resource-planner tests passed (13/13), covering missing routes, both directional buffers, address-change staleness, independent approval rejection and strict same-site zero-minute validation. |
| Interface | Production-bundle work-plan browser suite passed (6/6); the added route workflow also passed independently (1/1) for save, recalculation, revision and mobile overflow. |
| Quality | Full Node suite passed (726 passed, 46 optional provider/PostgreSQL tests skipped, 0 failed); full frontend suite passed (110/110 after making the worker-reply polling assertion reflect its stable approved state); full ESLint and Vite production build passed. Hosted database parity and live deployment were not exercised. No commit, push or deployment. |

## 2026-09-24 - Shared material stock and cross-job allocations

The inventory workspace now has a company stock register with evidence-bound
physical counts, free/reserved balances, linked job requirements, and a retained
allocation history. Reservation is transactional: the material row is locked in
hosted PostgreSQL, while local SQLite serializes the write transaction. A job
cannot reserve more than its requirement or the free quantity; only one active
allocation may exist per requirement. Office operators can release an allocation
or record partial/full consumption against a reference. Idempotency keys protect
replayed stocktakes and allocation commands; conflicting replays fail closed.

This does not merge job-site availability into warehouse stock, process receipts
into the stock register, track bins/lots/expiry, handle substitutions/returns, or
create supplier commitments. Existing material requirements are reservable only
when linked to a company catalogue item with the same unit. No schedule, purchase
order, client date, or external communication is changed by these operations.

| Gate | Verified result |
| --- | --- |
| Ledger | Focused local stock tests passed for cross-job shortage prevention, release, partial consumption, replay conflict, and reservations protecting counted stock. |
| Interface | Component tests passed (2/2); production-bundle browser flow passed for stock reservation and partial consumption, including mobile width and scoped axe accessibility checks. |
| Hosted parity | Migration is written for the shared ledger adapter; PostgreSQL integration was not run because no test database is configured. |

## 2026-09-24 - Warehouse receipts feed shared stock

Material-receipt forms now distinguish direct-to-job-site deliveries from
company-warehouse receipts. Warehouse receipts require a named storage location
and each accepted line must resolve to exactly one shared catalogue item with an
identical unit. Accepted quantities and receipt-linked stock movements commit in
the same ledger transaction; exact receipt replays cannot add stock twice.
Field-worker receipt submissions are pinned to job-site destination by the
server even if a client submits a warehouse destination. Approved receipt
reversals create compensating stock movements, but are blocked if removal would
make the physical balance negative or reduce it below active allocations.
Historical receipts without an explicit destination retain their previous
fingerprint verification and continue to mean direct-to-site receipts.

Warehouse-to-site logistics now have a separate, evidenced chain. An office
operator dispatches reserved stock with a unique transport reference, evidence,
and expected arrival. That reduces company stock and records an ETA against the
job requirement, but does not mark materials as available at the site. An
assigned field worker confirms each partial arrival with received, accepted,
damaged, location, and evidence details. Only accepted site quantities count
toward material availability and schedule readiness. Dispatch and arrival
commands are replay-safe, job-scoped, audited, and constrained by role. A
warehouse receipt with discrepancies may still add its accepted warehouse
quantity, while the receiving discrepancy remains visible and reviewable.

This still does not add bins, lots, expiry, returns, or supplier ordering.

| Gate | Verified result |
| --- | --- |
| Ledger/API | Focused receipt, stock and API tests passed (9/9), covering exact replay, accepted quantities, role-bound destinations, atomic catalogue matching, allocation-safe reversal and integrity diagnosis. |
| Interface | Production-bundle browser flow passed (1/1); warehouse-received stock appeared in inventory history before reservation and partial consumption, with mobile-width and scoped axe checks. |
| Hosted parity | SQLite migration is covered locally; PostgreSQL integration still requires a configured test database. |

### Warehouse-to-site material flow (2026-09-24)

The workflow separates company warehouse stock from material physically
available to a job. A reservation may be issued with an expected arrival, but
the schedule remains blocked until a field receipt records accepted quantity.
Partial, damaged, and delayed deliveries retain separate evidence and do not
silently satisfy the remaining requirement. Assigned field workers can also
record receipts in their encrypted offline work pack. The vault stores each
partial arrival locally with the dispatch reference, expected open quantity,
source-pack hash, evidence reference, and stable entry key. On reconnect,
source-bound pack responses and photos synchronize before receipts, then site
receipts sync in order. A changed dispatch or remaining quantity becomes a
visible conflict and never silently changes stock. Only server-confirmed
accepted quantities update the work pack and job availability.

| Gate | Verified result |
| --- | --- |
| Ledger, migration, and API | 10/10 focused tests passed for migration reconciliation, warehouse/site separation, partial receipt, damaged quantity, idempotency, field assignment authorization, and stock/schedule effects. |
| Browser and field work pack | 113/113 frontend tests passed; 2/2 browser E2E tests passed, covering warehouse dispatch/consumption and a mobile offline, multi-part receipt round trip with tenant isolation. |
| Full local regression | 734 Node tests passed, 46 skipped, 0 failed; lint and production build passed. |
| Hosted parity | PostgreSQL runtime remains unverified without a configured integration database. |

## 2026-09-24 - Duurzame uitvoerderssessies

Sessies van uitvoerders zijn niet langer afhankelijk van het geheugen van één
Node-proces. Het ledger bewaart uitsluitend de hash van het bearer-token, met
accountkoppeling, aanmaak-, verval- en intrekkingstijd en een reden voor
intrekking. Een serverherstart verbreekt een geldige sessie niet. Uitloggen,
schorsing, identiteitskoppeling en herstel trekken bestaande sessies in. Bij
overzetten naar hosted worden lokale sessies ingetrokken, zodat tokens niet
tussen omgevingen worden hergebruikt. Migratie 088 maakt de tabel en indexen aan.

| Gate | Verified result |
| --- | --- |
| Ledger and portal | Focused worker portal/API tests passed (15/15), including persistence across ledger reopen and logout revocation. |
| Recovery and identity | Backup restore, identity conversion, and hosted-transfer invalidation tests passed. |
| Full local regression | 738 Node tests passed, 46 skipped, 0 failed; ESLint passed. |
| Hosted parity | PostgreSQL integration tests were skipped because `CONTRACTOR_AI_POSTGRES_TEST_URL` is not configured. Hosted PostgreSQL remains unverified. |

## 2026-09-24 - Recovery closure verifies linked operational sources

A recovery case is no longer closable solely because an operator supplies a
free-text resolution note. Before closure, the ledger checks current linked
state: material shortfalls must be cleared, safety incidents must be resolved
through their own safety process, worker absence must have no unresolved
assignment conflict and its affected approved appointments must be reviewed,
and active contractual milestones must have a current no-risk review. Existing
field-task blockers still require a later `in_progress` report by the same
worker on the same task. Missing or stale source sets block closure; source
reassessment and final closure are separate commands. The closure stores the
checked source version, per-source proof summary, actor and time in the ledger
and audit metadata. It does not send messages, alter schedules/orders, or
authorize physical safety work.

| Gate | Verified result |
| --- | --- |
| Domain and API | Recovery tests passed (12/12), including open absence/material/safety blocks, successful closure after material recovery and stale snapshot/audit tamper detection. |
| Interface | Recovery component tests passed (7/7); production-bundle operational recovery browser flows passed (4/4), including desktop/mobile checks and existing accessibility assertions. |
| Quality | ESLint passed. The run was focused on recovery; the full repository regression suite was not rerun for this increment. |

## 2026-09-24 - Supplier delivery performance

The office trade-partner workspace now includes a source-derived delivery
scorecard. It distinguishes issued purchase orders, first receipts, completion,
damaged quantities, and unresolved short deliveries. On-time-and-complete is
calculated only over completed orders with a valid requested delivery date;
completed orders without that evidence are shown separately rather than
silently treated as late or on time. Draft and unissued orders are excluded.
The endpoint is authenticated and unavailable to field-worker sessions. It is
read-only: no supplier messages, purchase orders, or delivery commitments are
created or changed.

| Gate | Verified result |
| --- | --- |
| Ledger/API | Focused aggregation and authorization tests passed, including split receipts, missing dates, damage, and open shortages. |
| Interface | Full frontend regression passed (116/116); supplier scorecard covers loading, error, empty, refresh, and Dutch display states. |
| Full local regression | 741 Node tests passed, 46 environment-dependent skipped; lint and production build passed. Release contract passed for 644 source files. |
| Bundle gate | Not yet passing: the current build exceeds CSS, aggregate gzip, offline-field, and operational-recovery budgets. No ceilings were increased. |
| Hosted parity | PostgreSQL tests were not run because no integration database is configured. |

## 2026-09-24 - Supplier history informs tender review

The supplier receipt scorecard is now connected to each supplier in the bid
package comparison. The office sees that supplier's on-time-and-complete result,
its measured sample size, open short deliveries, and orders with damage before
requesting preferred-bidder approval. Matching uses the stable trade-partner ID
only; a supplier-name similarity is not treated as identity. No history, missing
dates, or an unavailable history endpoint do not block the comparison and never
produce an inferred zero or perfect reliability score. The signal is factual
context only: quote scope, price, programme, compliance, and evidence remain for
the human reviewer, and nothing ranks, selects, contacts, or orders a supplier.

| Gate | Verified result |
| --- | --- |
| Component behavior | Supplier match, exact denominator, no-date sample, no-history and API failure states covered by 4 focused tests. |
| Connected workflow | Full tender-to-approved-order browser flow passed (1/1), including a newly registered supplier with no fabricated history. |
| Frontend and quality | Full frontend suite passed (120/120); ESLint and production build passed. Release contract passed (646 source files). |
| Bundle | Total gzip remains over the configured limit (598,972/578,500 bytes); largest CSS, offline-field, and recovery modules also exceed their existing limits. Limits were not changed. |
| Provider boundary | The added read is authenticated office data. No supplier communication, order, approval, or external provider action was triggered. |

## 2026-09-24 - Field offline cache scoped to executable route

The field service worker no longer preloads every office, identity, client, and
field feature bundle. It now precaches the app entry shell and the dependency
closure for the offline work-pack page: its JS, CSS, shared runtime, and
referenced visual assets. The selected 10 JS/CSS files total 295,423 raw bytes,
compared with 79 files and 2,391,447 bytes in the previous all-product cache;
this avoids about 2.10 MB (87.6%) of raw JS/CSS storage and transfer for a field
offline installation. Encrypted work-pack data, drawings, evidence, and queued
responses remain handled by their existing private vault and guarded sync path.

| Gate | Verified result |
| --- | --- |
| Asset graph | 2 focused Node tests cover transitive dependencies, CSS/assets, unrelated-chunk exclusion, and fail-closed missing entries. |
| Production browser | Mobile offline work-pack install, company-separated vaults, queued site receipts/photos, wrong-company sync refusal, and every precached asset URL passed (1/1). |
| Regression | Full Node suite passed (743 passed, 46 skipped, 0 failed); lint, build, and release contract passed (647 source files). |
| Bundle limits | CSS, aggregate gzip, offline-field, and recovery budgets still fail at their existing thresholds; this change narrows the field install cache and does not claim to fix those separate bundle-size gates. |

## 2026-09-24 - Searchable, paged operational registers

Added one shared accessible pagination control to crew, availability, equipment,
and trade-partner registers. It pages the already-filtered results in batches of
10, 25, or 50 and resets to the first page when the search or status filter
changes. Material receiving now also supports reference, project, receiver,
item, and exception search; newest/oldest ordering; and paged results, while
preserving the active, exception, and history views.
The new pagination and receiving controls use the existing Dutch operator
locale rather than exposing untranslated English labels.

| Gate | Verified result |
| --- | --- |
| Behavior | Focused tests cover crew pagination/search-reset and material-receipt search, ordering, pagination, and filter scope. |
| Frontend regression | Full frontend suite passed (122/122); ESLint and production build passed. |
| Release contract | Passed: 101 canonical paths, 12 retired paths, 17 hosted environment keys, 648 source files. |
| Bundle limits | Still fail at the existing budgets: largest CSS 309,851/300,000 bytes; total gzip 599,962/578,500; offline field 12,638/11,000; operational recovery 4,121/4,100. Budgets were not raised. |

## 2026-09-24 - Recoverable work-balance allocation draft

The job-level work-balance form now retains its incomplete allocation per
authenticated operator and job using the existing bounded session-draft store.
Each draft carries the production-baseline source hash and any pending
idempotent approval command. A draft is restored only against the same source
revision, discarded when that revision has changed, and stripped of its internal
hash before the existing approval request is sent. If the connection result is
unknown, reloading the page preserves the original command and entry key for an
exact retry. The editor remounts when the selected job or operator scope
changes, preventing an old operator's open draft from remaining visible after
an account switch.

| Gate | Verified result |
| --- | --- |
| Behavior and safety | Tests cover recovery, changed-source invalidation, and exact retry of the same idempotent approval command after a simulated page reload. |
| Operator isolation | The production mount uses the authenticated company/ledger/operator scope; existing draft-store tests cover cross-scope isolation and secret-key removal. |
| Frontend quality | Focused Work Balance and draft-store tests passed (9/9); full frontend suite passed (123/123), lint and production build passed, and release contract passed (648 source files). |
| Bundle limits | Current bundle remains above existing limits: largest CSS 309,851/300,000 bytes; total gzip 600,153/578,500; offline field 12,638/11,000; operational recovery 4,120/4,100. |

## 2026-09-24 - Role-based in-product help

Added a searchable Dutch/English help workspace to the dashboard,
separated into contractor, field-worker, and client guidance. Articles cover
intake-to-delivery, position planning, approvals and retry safety, field work
packs/offline use, safety prerequisites, progress and exceptions, operational
availability, secure client conversations, photos, and explicit versioned
choices. A field-scoped session sees field guidance only. Workspace links are
shown only when the current operator can navigate to that destination. The
content is a maintained starting guide rather than exhaustive documentation of
every specialist register, so the help-system phase remains partial.

| Gate | Verified result |
| --- | --- |
| Component and navigation behavior | 13 focused tests passed across role views, search, workspace links, navigation grouping, and locale labels. |
| Production browser | Dashboard navigation, all three audience views, source-safe client guidance, Dutch locale, mobile overflow, and axe scan passed (1/1; zero axe violations on the help workspace). |
| Regression and release | Full frontend suite passed (127/127); ESLint and release contract passed (652 source files); production Vite build passed. |
| Bundle limits | Existing gate remains failed: largest CSS 309,851/300,000 bytes; aggregate gzip 606,318/578,500; offline field 12,639/11,000; operational recovery 4,121/4,100. The help content increases aggregate gzip by about 6.2 kB; limits were not raised. |

## 2026-09-24 - Recovery follow-ups enter the daily workbench

Open operational-recovery cases now surface in the company-wide daily workbench
when the case deadline, latest supplier response/delivery check, customer
response check, or contract-impact review falls within seven days. Overdue items
receive high priority; future items inside the window remain visible as review
work. Resolved cases and superseded follow-ups do not reappear. Every action
opens its linked job and remains non-executable: the queue neither changes a
case nor sends, orders, reschedules, or closes anything. A damaged retained case
appears as a blocked integrity review without exposing snapshot contents.

| Gate | Verified result |
| --- | --- |
| Domain and workbench | Five focused recovery command-plan tests and six command-workbench tests passed, including exact replay-stable IDs, active-status filtering, latest follow-up selection, horizon behavior, integrity failure handling, and confirmation that autonomous draft application skips these review-only actions. |
| Production browser | The production-bundle office flow passed (1/1): a real partial material receipt created an overdue owned recovery case, surfaced it in the daily workbench in English and Dutch, opened the linked job, and offered no draft-execution button. |
| Frontend and release | Full frontend suite passed (127/127); lint, production build, and release contract passed (101 canonical paths, 12 retired paths, 17 hosted environment keys, 653 source files). |
| Bundle limits | Still fail at existing limits: largest CSS 309,851/300,000 bytes; aggregate gzip 607,277/578,500; offline field 12,639/11,000; operational recovery 4,120/4,100. Limits were not raised. |
| Hosted parity | PostgreSQL integration was not run because no test database is configured. No provider, external communication, commit, push, or deployment was used. |

## 2026-09-24 - Recovery instructions require worker read-back

Office operators can now attach a revised instruction to the exact field-task
blocker, assigned worker and recovery case. Only that worker's active work pack
contains it, and the pack revision changes. Closing that task's recovery case
requires a later progress report from the same worker and task, preceded by an
explicit acknowledgement of the exact pack revision containing the instruction.
The instruction and closure evidence remain audit-checked. Acknowledgement is
not safety clearance. The complete instruction is now rendered from the
versioned offline pack in the web offline view and in the native Android source.
Offline acknowledgment and later same-task progress retain the same source hash;
the queue sends them in order and the server remains authoritative. A changed
or revoked source is a conflict, not an instruction to silently rebind.

| Gate | Verified result |
| --- | --- |
| Domain and UI tests | Full Node suite exited successfully. Focused recovery/work-pack tests cover task and worker scoping, work-pack revision invalidation, acknowledgement ordering, same-worker/task resumption, idempotency and tamper detection. The offline vault test verifies that instruction text is absent from sealed data and that exact-version acknowledgement is synchronized before same-task progress. Full frontend suite passed (130/130), including the rendered offline web view. |
| Production browser | The recovery browser suite passed 4/4 against the production build. A new targeted production E2E passed 1/1: the named worker downloads the office instruction, opens the encrypted work pack while disconnected, queues acknowledgment and same-task resumption, then reconnects; the test verifies the server receives acknowledgment before progress. Replacement, supplier and customer-impact flows also passed in the broader suite. |
| Release checks | ESLint, production Vite build and release contract passed (101 canonical paths, 12 retired paths, 17 hosted environment keys, 653 source files). `git diff --check` passed; Git only warned about the existing LF-to-CRLF working-copy policy. |
| Bundle limits | Gate remains failed at existing budgets: largest CSS 309,851/300,000 bytes; aggregate gzip 607,674/578,500; offline field 12,639/11,000; operational-recovery chunk 4,363/4,100. Limits were not raised. |
| Remaining scope | Offline clients cannot see remote instruction changes or assignment revocation until they reconnect; stale submissions remain server conflicts. The Android changes have source-contract coverage only and are not compiled or device-tested. No PostgreSQL test database, external provider, customer/worker message, commit, push or deployment was used. |

## 2026-09-24 - Schedule impact checks contractual completion dates

The source-bound duration-change analysis now compares the current and proposed
schedule end dates with active, current, accepted contractual `complete_by`
commitments. It reports within-date, projected-late (calendar-day difference),
unknown, or changed-source status alongside the retained evidence reference.
Contract revisions are included in the analysis source hash, so a later
revision invalidates an older result. This is a read-only forecast: it does not
change the plan or contract. It does not yet interpret working calendars,
legal date semantics, unaccepted commitments, or milestone types other than
`complete_by`.

| Gate | Verified result |
| --- | --- |
| Domain and UI | Focused review tests passed, including contract-date comparison and stale-analysis invalidation after a later commitment revision. English and Dutch component tests passed. |
| Production browser | The office workflow used a genuinely accepted quote and current completion commitment; the current schedule was on time and the proposed duration ended one calendar day late. Production E2E passed (1/1). |
| Regression and release | Full Node suite passed (751 passed, 0 failed, 46 skipped); full frontend suite passed (131/131); ESLint, production Vite build, release contract (101 canonical paths, 12 retired paths, 17 hosted environment keys, 654 source files), and `git diff --check` passed. PostgreSQL-only tests were skipped because no test database is configured. |
| Bundle limits | Existing limits remain exceeded: largest CSS 309,851/300,000 bytes; aggregate gzip 608,386/578,500; offline field 12,811/11,000; operational recovery 4,364/4,100. Limits were not raised. |
| Remaining scope | Quantity estimate rows are now included, but approved-scope mapping, material/order and task dependencies, procurement lead times, and client-decision impact are not yet fully connected. No external provider, contract update, commit, push or deployment was used. |

## 2026-09-24 - Change scenarios include measured takeoff quantities

The contractor's source-bound change-impact workflow now reads the job's
existing quantity takeoffs and includes their revisions in the analysis hash.
An operator may select measured line items and enter a proposed total quantity.
The preview derives the quantity delta, cost delta and revenue delta from the
retained quantity and unit rates, and shows its WBS/work-package context beside
the schedule, contract-date and manually estimated cost/revenue effects.
The takeoff itself is never edited. A takeoff edit after analysis makes that
analysis stale. Cross-currency takeoff deltas remain visible per item but are
excluded from consolidated totals. Preparing a formal variation still requires
the operator to enter its contractual amount and schedule days separately.

| Gate | Verified result |
| --- | --- |
| Domain and API | Focused tests passed for server-derived quantity and price deltas, source invalidation after a takeoff edit, foreign/duplicate item rejection, no mutation, and explicit GBP/EUR separation. |
| Frontend | Component tests passed (5/5); the Dutch/English surface includes the measured-item input, proposed total quantity, and per-item currency display. |
| Production browser | Production-bundle E2E passed: create a job and takeoff, calculate a quantity change in the dossier review, compare contract completion dates, retain the source-bound review, and prepare an unapproved variation draft; mobile overflow and axe checks passed. Browser plugin was not available, so repository Playwright was used. |
| Regression and release | Full Node suite passed (752 passed, 0 failed, 46 skipped); frontend suite passed (132/132); ESLint, Vite production build, release contract (101 canonical paths, 12 retired paths, 17 hosted keys, 654 source files), and `git diff --check` passed. PostgreSQL-only tests were skipped because no test database is configured. |
| Bundle limits | Still fail at the existing budgets: largest CSS 309,851/300,000 bytes; total gzip 609,749/578,500; offline field 12,811/11,000; operational recovery 4,364/4,100. Budgets were not raised. |
| Remaining scope | Takeoff changes are estimates, not material orders or accepted variations. Existing takeoff unit rates do not calculate tax, procurement lead time, wastage/design geometry changes, or cross-currency conversion; those remain separate review inputs. |

## 2026-09-24 - Change scenarios include explicit material coverage

The change-impact preview can now include a proposed total for an existing
material requirement. It computes uncovered quantity from proposed need,
accepted available stock and remaining quantities from linked purchase-order
lines from orders that have actually been issued, where the order line contains
the same explicit material-requirement ID, then identifies active tasks whose
retained `materialRequirementIds` reference that requirement. Unissued drafts
and name-only matches are excluded. An uncovered proposed increase flags extra
supply confirmation for the affected work steps. This remains a source-bound
simulation: material deltas do not alter stock, the requirement, schedule or
purchase orders and are not added to financial totals.

| Gate | Verified result |
| --- | --- |
| Domain and API | Latest focused domain/API suites passed (14/14), covering available stock, explicitly linked issued orders, exclusion of unissued draft orders, task links, foreign-requirement rejection, read-only behavior and the API preview contract. |
| Frontend | Component tests cover material selection, proposed quantity, uncovered-shortfall, schedule-readiness warning and linked-task rendering. English and Dutch labels are present. |
| Production browser | Production-bundle Playwright E2E passed (1/1), including accepted-stock and uncovered-quantity display, supply-confirmation warning, linked task visibility, mobile overflow and axe accessibility scan. |
| Regression | Full frontend suite passed (133/133); full-repository ESLint and release contract passed; production Vite build passed as part of the E2E runner. The last full Node suite before the final issued-order filter passed (753 passed, 0 failed, 46 skipped); focused Node tests were rerun after that refinement. |
| Remaining limits | Material unit conversion, wastage, cost valuation and supplier-confirmed delivery-date impact are not inferred. The warning does not automatically reschedule work or place an order. |

## 2026-09-24 - Registered material shortages enter operational recovery

Material requirements with a positive uncovered quantity now appear as
operational-recovery sources even when no delivery receipt has yet been logged.
Accepted available stock and explicitly linked lines from actually issued
purchase orders are deducted; draft orders and name-only matches are not.
Affected active tasks are retained with the source, and an open shortage blocks
evidence-backed recovery closure. The office can assign an owner, review date
and recovery action, then record supplier contact against an issued order with
an evidence reference and an optional confirmed/follow-up date. Existing
receipt-discrepancy follow-ups remain supported. Recording a note sends no
message, edits no order date, and creates no external commitment. When stock
or a verified order changes, the source hash requires explicit reassessment.

| Gate | Verified result |
| --- | --- |
| Domain | Focused recovery tests verify draft-order exclusion, an actually issued explicitly linked order, open-shortage blockers, task linkage, case ownership, supplier-note source binding, no outbound communication, and ledger integrity. |
| API and UI | API source enumeration and the React operator flow cover material-requirement sources; receipt-based supplier follow-up remains backward compatible. |
| Remaining limits | Supplier messages are still manually contacted and recorded; there is no automatic procurement, stock reservation, unit conversion, delivery prediction, or automatic rescheduling. |

## 2026-09-24 - Historical supplier lead-time risk

Supplier performance now derives order-to-full-accepted-receipt lead times only
from verified issued purchase orders with complete retained receipt evidence.
When at least three such orders exist for the same supplier identity, the
historical 75th-percentile lead time is shown. For an open issued order with a
requested delivery date, the service compares issue date plus that historical
P75 against the requested date and raises a qualified risk signal when the
historical indicator falls later. The signal appears in the supplier scorecard
and the bidder comparison; the scorecard can open the affected job. This is a
company-record indicator, not a supplier guarantee or prediction. It does not
model item-specific lead times, working calendars, split shipments, substitution,
transport, or future supplier capacity and does not contact a supplier, revise
an order, or change a schedule.

| Gate | Verified result |
| --- | --- |
| Domain and API | Tests verify fully accepted issued-order history, late P75 risk, insufficient-sample suppression, and authenticated office-only access. |
| Frontend | Tests verify Dutch supplier risk display, direct navigation to the linked job, and reuse of the same history signal during bid comparison. |
| Remaining limits | Three observations are an early-warning minimum only; the historical indicator is descriptive and must be reviewed against current supplier confirmation and the job's material schedule. |

## 2026-09-24 - Shared warehouse position in work planning

Material-blocked tasks now carry a read-only position from the shared company
stock ledger into their schedule constraints and planning hash: counted stock,
active reservations, free warehouse stock, the quantity reserved for this job,
the quantity committed to other jobs, and job-site quantities still in transit.
The job workspace surfaces this position beside the task's remaining shortfall.
Reservation alone does not clear a blocker and calculation never creates or
edits a reservation. When free linked stock exists, an office operator can
deliberately reserve a chosen quantity from the same blocker using a stock-count
or source reference; the existing ledger enforces free-balance, unit, requirement
and duplicate-allocation rules. The plan refreshes after this action, but the
task remains blocked until its material reaches or is evidenced as arriving at
the site. A site issue's expected arrival can shift the internal
task start only when the outstanding in-transit quantity covers the entire
remaining shortfall. A smaller split shipment remains blocked until more supply
is recorded. From the same blocker, an office operator can issue a reserved
quantity with a dispatch reference, evidence reference, and expected arrival;
the stock ledger decrements warehouse stock and records the shipment as in
transit. Physical job-site availability still increases only through the
separate accepted, evidenced field receipt. The planning hash includes the
active allocation identity and stock position so changed cross-job
commitments stale a previous schedule review.

| Gate | Verified result |
| --- | --- |
| Domain | Focused tests cover cross-job reservations, read-only planning, changed planning hashes, insufficient split delivery, full expected coverage, and unchanged site-receipt authority. |
| Frontend | The production browser test passed (1/1) for work-plan reservation, evidence-bound dispatch and ETA, transit-based scheduling, unchanged site stock before field receipt, and 390px mobile overflow checks. |
| Regression and release | Focused domain/API suite passed (25/25), covering shared stock, project scheduling, resource planning, and Last Planner. Full frontend suite passed (134/134) on rerun after one transient worker-board polling failure; full ESLint, production build, and release contract passed. The complete Node suite was green in the previous verification cycle but was not rerun for this continuation. |
| Remaining limits | This is an availability signal, not procurement or an automatic stock allocator. Reservation and dispatch remain deliberate office actions; field receipt remains separate; supplier dates remain estimates unless backed by a separate verified source. PostgreSQL-specific validation still requires a configured test database. |

## 2026-09-24 - Interruption-resilient recovery drafts

The operational recovery workspace now restores unfinished source selection,
case planning, review text, and an unresolved case command for the same signed-in
operator and job after a reload or dossier remount. Supplier follow-up,
replacement selection, client appointment impact, and contract-date impact forms
also retain their work within the operator's current browser session. Exact
idempotent follow-up commands remain available for retry after an ambiguous
network result; the product does not create a second command with a new key just
because the page was reopened. Recovery selection and dependent form instances
are scoped to current source identity, so changed source data is not silently
carried forward. External messages, supplier orders, assignments, and schedule
commitments remain behind their existing explicit workflows.

These drafts use the existing bounded, 12-hour session-storage recovery helper;
they are not encrypted offline records, a durable server draft, or cross-device
synchronization. Secrets are filtered by the helper, but users should still avoid
putting unnecessary sensitive details into draft text. Component-internal forms
outside these workflows remain to be audited before phase 021 can be complete.

| Gate | Verified result |
| --- | --- |
| Frontend behavior | Operational-recovery component suite passed (10/10), including source-current draft restoration and exact same-command retry after reload following a simulated lost response. |
| Browser/release verification | Production-browser operational recovery suite passed (4/4), including worker recovery, coordinated replacement, supplier follow-up, and client appointment impact. Full frontend suite passed (136/136); repository ESLint, Vite production build, and release-contract verification passed. No API behavior or external-provider action was added. |
| Remaining limits | Session recovery is same-browser/session only and expires after 12 hours. It is not a substitute for encrypted offline field records or universal form autosave. |

## 2026-09-24 - Worker availability draft recovery

The admitted worker's unavailability and standby report now recovers its mode,
start, end or follow-up time, and unknown-return choice after navigating away or
reloading the worker board. Drafts are scoped to the worker account in the
current browser session; logout and an expired/invalid session reset the form
so availability details are not left visible to the next account. The worker
can also request an early end to a recorded period. This creates or replays the
same cancellation approval, leaves the planning block active until an
independent decision, and exposes the pending state in the worker view. An
active standby period with an outstanding call-out cannot be ended until the
call-out is dealt with. The form continues to avoid collecting medical or
family-care reasons. Submissions report scheduling conflicts for operator
review; drafts and early-return requests do not reschedule anything
automatically.

| Gate | Verified result |
| --- | --- |
| Component behavior | Worker-board frontend tests passed (7/7), covering draft restoration and approval-gated early return. Full frontend suite passed (138/138). |
| API and safety | Work-board and standby-callout API tests passed (3/3), including worker ownership, exact request replay, the retained schedule block, and rejection while an active standby call-out is outstanding. |
| Browser/release verification | The production browser test passed (1/1), covering mobile draft recovery, an early-return request, and continued visibility of the conflicted job. Repository ESLint, Vite production build, and release-contract verification passed. |
| Remaining limits | Drafts use bounded session storage, expire after 12 hours, and do not synchronize across devices or provide encrypted offline storage. |

## 2026-09-24 - Availability conflict completeness

The workforce availability register previously stopped at 250 assignment
conflicts without a direct indicator that additional conflicts might be hidden.
It now checks one extra row as a completeness sentinel, returns at most 250
visible conflicts, and reports whether that list is complete. The operator view
shows a `250+` count and warns when the view is capped. Coordinated replacement
across assignments is disabled while that global conflict list is incomplete;
single-assignment replacement remains available and is fully revalidated by the
server. Operational recovery uses the same explicit completeness signal, so it
cannot claim a portfolio plan covers all affected assignments from a truncated
list.

| Gate | Verified result |
| --- | --- |
| Backend | Workforce availability and operational recovery tests passed (27/27), including exactly 250 conflicts versus a 251-row sentinel and propagation of an incomplete-list state. |
| Frontend | Availability resource component tests passed (3/3), including the capped-count warning and disabled portfolio action. |
| Remaining limits | The register intentionally displays at most 250 conflicts. When capped, coordinated replacement remains blocked until the operator can review a complete conflict set; ordinary single-assignment recovery is unchanged. |

## 2026-09-24 - Supplier-confirmed material availability

An office operator can now choose whether a supplier's evidence-backed confirmed
delivery date should also update the internal availability forecast for the one
exact material requirement linked to an active shortfall. The choice is offered
only when that requirement is unambiguous and its purchase order has been issued
with a recorded external acceptance. The supplier follow-up remains an
idempotent, source-bound ledger command; applying the date records the evidence
reference and audit event, then marks the recovery case's captured source as
stale so it must be reviewed again. A new work-plan calculation can use this
availability date to place linked work, but this does not approve or apply a
resource plan.

The change does not rewrite the purchase order's requested date, adjust a
customer commitment, send a supplier/customer message, or make unissued orders
count as supply. Invalid material IDs, stale sources and unissued purchase
orders fail closed. The browser-test-only verified provider configuration is
scoped to isolated Playwright runtimes.

| Gate | Verified result |
| --- | --- |
| Domain/API | Operational recovery domain and API tests passed (13/13), including exact material scope, issued-order requirement, idempotent replay, stale-source behavior and unchanged communication/order records. |
| Interface | Supplier recovery component tests passed (10/10); full frontend suite passed (140/140). |
| Browser/release | Production-bundle Chromium supplier-to-forecast workflow passed (1/1); ESLint, production build, bundle budgets and release contract passed. |
| Remaining limits | A supplier-entered date is evidence-referenced, not independently verified with the supplier. It changes only the forecast. Separate operator review and approval remain required for commitments or resource plans. PostgreSQL hosted acceptance was not part of this local workflow. |

## 2026-09-25 - Supplier forecast refreshes the operator work plan

When an office operator applies an evidenced supplier ETA to a linked material
shortfall, Contractor.AI now reloads the job dossier and recalculates the visible
work plan from its current start time. Linked task windows therefore reflect the
new material availability without requiring a second manual calculation. The
operator can then explicitly request a new schedule baseline; it is retained as
pending approval and is not activated automatically.

| Gate | Verified result |
| --- | --- |
| Browser workflow | Production-bundle Chromium verified supplier ETA, refreshed linked task window, requested schedule baseline with `pending_approval`, unchanged purchase-order requested date and communications, and no failed request to the owner-only runtime-capabilities route for the office role (1/1). |
| Remaining limits | The supplier date remains evidence-referenced rather than independently verified. Schedule activation, resource assignment and customer commitments remain approval-gated. |

## 2026-09-25 - Offline customer conversation and photo outbox

The customer portal now supports offline chat after it has been opened online
and its service worker controls the page. Project and recent conversation
snapshots are encrypted in device-local IndexedDB. A customer can queue text and
one JPEG/PNG/WebP photo, reload while offline, and later synchronize the exact
message with the same idempotency key. The UI marks queued content as local and
not received until the server confirms it. Photos remain private and are fetched
through the authenticated endpoint.

The outbox is limited to 10 messages, 20 MiB total, 5 MiB per photo and seven
days. A last-known snapshot may be stale; authorization failures while online
clear cached portal/chat snapshots, but disconnected revocation cannot erase or
invalidate local data. Offer responses, feedback, selections and contract
decisions remain unavailable offline. This does not claim WhatsApp, offline AI,
native mobile acceptance or hosted-provider readiness.

| Gate | Verified result |
| --- | --- |
| Unit/component | Offline AES-GCM outbox and conversation suites passed (17/17); service-worker dependency closure tests passed (2/2). |
| Production browser | Mobile Chromium passed offline text/photo enqueue, reload, reconnect, server receipt and successful private photo retrieval (1/1). |
| Security and release | Repository-wide ESLint passed; full frontend regression passed (153/153); focused conversation/portal/offline-shell API tests passed (8/8); release contract is valid (101 canonical routes, 12 retired routes, 17 hosted environment keys). The production build completed in the browser test. No live provider or EU deployment was exercised. |

## 2026-09-25 - Opportunity demand against crew capacity

Opportunities can now retain an expected work window and estimated hours by
trade. Bid evaluation compares those demand assumptions with active workers,
effective daily profiles, current dated allocations, overlapping assignments
and standby periods. Undated active assignments remain unknown rather than being
counted as free capacity. A known shortfall blocks the bid recommendation even
when other workforce data is incomplete; missing profiles or unmatched trade
roles remain visible as gaps. The source fingerprint makes pending bid decisions
stale when the underlying capacity changes. This is advisory only: it does not
reserve, assign or contact workers.

The estimate does not yet model unregistered subcontractor capacity, supervisory
coverage, travel, task dependencies, materials or detailed skill/qualification
matching. It is not a resource-feasible schedule or an execution commitment.
The English office interface also retains human-readable accessible names in the
production build; compaction is limited to entries with a preserved language
fallback.

## 2026-09-25 - Klantreacties hervatten na browserherlaad

Unsent partial-delivery response fields and uncertain command attempts now
recover for up to 12 hours in the same browser tab. Storage is scoped by a
fingerprint of the client link, offer and source version; it does not contain the
raw link token, photo bytes or browser `File` object. Exact response idempotency
keys and payloads survive remount. A confirmed conversation photo is reused. If
upload receipt is uncertain, the same file must be selected again and pass a
SHA-256 match before the original upload command can be retried. Existing server
expiry, revocation and current-source checks remain authoritative.

| Gate | Verified result |
| --- | --- |
| Component workflow | Focused response component suite passed (7/7), including same-link recovery, link isolation, exact uncertain-response retry, acknowledged-photo reuse, and exact-file re-selection after uncertain upload. |
| Quality | ESLint passed for the changed component and tests; Vite production build and release-contract verification passed (101 canonical paths, 12 retired paths, 17 hosted environment keys). `git diff --check` reported no whitespace errors; Windows emitted existing LF-to-CRLF notices. |
| Regression | Focused component suite passed (7/7). The complete frontend run passed 147/148; one existing Conversation RFI test exceeded its 5-second timeout under suite load, then the complete Conversation test file passed separately (5/5). |
| Remaining limits | Session-only, same-tab recovery; no cross-device or offline response recovery. The tests exercise React/HTTP contracts, not a live client portal, provider, hosted database, browser-device matrix or native app. |

## 2026-09-25 - Offline unavailability reporting from the native field app

The Android worker can save an unavailability period in the existing encrypted,
account-scoped offline queue, including an unknown return with a review date.
Reports are worker-wide, not attached to a job, and contain no health reason.
The queue marks them as not received by the office until authenticated sync under
the original worker and server. The API derives identity from that session and
returns any affected assignments without changing them. Exact duplicate periods
replay as the existing ledger record. A successful server result is stored in the
encrypted vault until the worker explicitly reviews it, so a later sync failure
does not hide an already accepted report. Pending/conflicted reports are capped at
10, and retained conflict detail is capped at 50 per report with truncation shown.

| Gate | Verified result |
| --- | --- |
| Native source contract | Offline queue entry, encrypted-vault save, original-scope sync, conflict display, 10-report and 50-conflict bounds covered by regression assertions. |
| API behavior | Identity API integration confirms worker identity is session-derived, an overlapping assignment is returned, and an exact retry returns the original period (`replayed: true`). |
| Regression | Offline work-pack and identity API suites passed (11 tests); repository ESLint passed; `git diff --check` reported no whitespace errors beyond line-ending notices. |
| Remaining limits | Java/Gradle/Android SDK/adb are unavailable in this environment. This native change remains uncompiled and untested on an emulator or phone. The queued state is not visible to the office until sync succeeds; native push notifications and live device acceptance remain outside this increment. |

## 2026-09-25 - Prune unreachable operator translations

Production catalog compaction now removes entries with no runtime-source
references and preserves dynamic labels that cannot be resolved at build time.
The compactor keeps the same translator API and only rewrites catalog entries
after parsing source with the existing AST-based guard.

| Gate | Verified result |
| --- | --- |
| Runtime tests | Compactor regression tests passed (2/2); all frontend tests passed (153/153); the production-bundle Dutch/English round trip passed in Chromium (1/1). |
| Quality | Repository ESLint and release-contract checks passed; Vite production build completed. |
| Remaining bundle issue | Total gzip is 612,861/578,500 bytes (1,105 bytes smaller than before this change), and client-delivery assets are 8,552/8,500 bytes. Bundle verification still fails; limits were not increased. |

## Client-to-contractor inbox follow-through

New inbound customer chat messages are surfaced on the contractor's daily
dashboard and deep-link to their exact job conversation. Only active client
accesses are listed. Inbox rows contain job/customer labels and timestamps, not
message bodies or photos. The office explicitly reviews currently loaded
messages; this creates an append-only audit event tied to the message's source
hash, while the source message remains immutable. Further messages remain
unread until separately reviewed. Field roles cannot access the inbox, and the
operator dashboard route applies its role projection.

Conversation API/unit tests (5/5), the connected-experiences mobile/desktop
browser tests (2/2), ESLint and the production build passed. This does not add
WhatsApp delivery or autonomous customer replies.

## Opt-in local analysis while office reviews client conversations

`CONTRACTOR_AI_CHAT_AI_AUTO_ANALYZE` is a separate opt-in, default false. With
it enabled alongside a correctly configured local model, opening an office
conversation with unreviewed inbound client messages triggers the existing
source-current local analysis, and newly received messages are analyzed while
the conversation remains open. The analysis is still internal proposal data;
it does not create RFIs or tasks, change schedules, approve replies or send
messages. UI, config and API tests verify both default-off and enabled behavior.
This is not durable background processing: a conversation must be opened in an
active office browser. Live-model interpretation quality remains unverified.

## 2026-09-25 - Prevent double-booked standby call-outs

Accepting a worker call-out now rechecks the current assignment, standby and
unavailability windows, and the worker's active replacement eligibility. A
previously accepted or approval-pending call-out reserves that worker's time
against overlapping call-outs; a second overlapping acceptance is rejected.
The check and transition occur in one ledger transaction. Workers can still
decline an outstanding call-out even when accepting it would be stale or
conflicting. Acceptance is not placement: the existing independent replacement
approval remains required.

| Gate | Verified result |
| --- | --- |
| API/work-board | Focused standby-callout and work-board tests passed (17/17), covering overlapping offers, second-acceptance rejection, decline, worker ownership, and independent approval. |
| Remaining limit | The worker sees changes through authenticated polling while the work board is open. Background push, external notifications, hosted PostgreSQL parity, and native-device acceptance remain unverified. No deployment, provider action, commit or push. |

## 2026-09-25 - Attribute approved actual costs to recovery cases

Recovery now lists only EUR expenses and supplier invoices that the cost
forecast already recognizes as approved actuals. Coordinators can allocate
part of a source item to an open recovery case; a transaction checks that
allocations across the job do not exceed the approved source. Every allocation
retains its source fingerprint, reason and immutable audit record. A
compensating reversal makes the attributed amount available again without
changing the source expense, invoice or accounting entries. Other currencies
remain unavailable until a verified conversion basis exists. Where a current
estimate exists, the case also compares it with currently approved and
attributed actuals to date; reversed or stale sources are excluded, and the
comparison is explicitly not a final account.

| Gate | Verified result |
| --- | --- |
| Recovery domain/API | Operational recovery tests passed (16/16), including net approved expense recognition, partial allocation, over-allocation rejection, reversal, audit integrity and existing operator authorization tests. |
| Interface | Cost-impact React tests passed (3/3), including actual-cost attribution, estimate comparison and reasoned correction. |
| End-to-end | Production-build browser workflow passed: governed expense submission and approval, safety disruption, recovery case, estimate, actual attribution, current remaining balance, estimate comparison and mobile width. |
| Quality | ESLint and Vite production build passed. A direct Node invocation of a JSX test is not supported; the tests were run with Vitest. |
| Remaining limit | Live hosted Postgres behavior and deployment are not verified. Existing bundle-size budget remains a separate known issue. No commit, push or external financial action. |

## 2026-09-25 - Convert current photo observations into reviewed internal RFIs

Office can now turn an observation from the current local photo analysis into
an internal RFI after reviewing and supplying its title, question, responsible
person and due date. Creation is bound to the current conversation analysis,
inbound message, exact photo SHA-256, observation and stated uncertainty. A
changed conversation/photo or altered replay payload is rejected. The RFI
retains this provenance without copying photo bytes; no schedule, customer
message or external commitment is changed.

| Gate | Verified result |
| --- | --- |
| API | Focused conversation API test verifies role enforcement, provenance, stable replay, payload conflict and stale-analysis rejection. |
| Interface/browser | React tests passed (9/9); the production-build Playwright office-conversation flow passed at 390px, verifying visible uncertainty, review fields, the photo-observation request, no horizontal overflow, and no app runtime errors. The browser analysis/action responses are fixtures; backend behavior is independently exercised against the real local ledger by the API test. |
| Remaining limit | Local fixture tests do not establish real vision-model accuracy, live provider operation, Postgres parity or deployment. |

## 2026-09-25 - Route client requests into formal variation control

A current source-bound customer request can now start a formal change-order
draft instead of being stranded as chat text or only becoming an RFI. Office
must review and enter scope, estimated net EUR amount, schedule impact and risk.
The retained formal variation requires the existing accepted contract source
and carries the exact chat quote, message fingerprint, analysis identity,
proposal and uncertainty in its checksummed snapshot and approval record. It is
created as a draft with a pending internal approval; client issue, verified
acceptance and work authorization remain separate gates.

| Gate | Verified result |
| --- | --- |
| API/ledger | Conversation API test verifies role denial, current-source binding, retained source identity, variation snapshot integrity, pending approval, no work authorization, exact replay, conflicting replay rejection and stale-chat rejection. |
| Interface | React test exercises the scope/justification/cost/schedule/risk form and checks the formal change-order endpoint payload. |
| Browser | Production-build Playwright flow exercises the photo RFI and client variation draft at mobile width; analysis and final browser command are fixtures, while ledger behavior is covered independently by the API integration test. |
| Remaining limit | A job without a retained accepted quote or positive contract baseline cannot create a formal variation and must first resolve its contract basis. No real model accuracy, hosted Postgres, external issue or client acceptance is claimed. |

## 2026-09-25 - Carry client-message provenance into change approval

The formal variation's internal approval preview now carries the checksummed
customer-message quote, source fingerprint and analysis identity into the
review window, alongside the AI suggestion and its uncertainty. The reviewer
can distinguish the client's request from verified scope, price, technical
feasibility or acceptance. This is evidence context only; the existing
approval, client issue, acceptance and work-authorization gates are unchanged.
The frozen client issue package also binds the full origin into its internal
source-basis hash and prints only the escaped customer quote. It does not expose
portal/message identifiers, hashes, internal AI suggestions or uncertainty in
the client-facing document or portal JSON.
An internally approved client request for changes or rejection now becomes
trusted revision provenance for the next change order. The office sees the
exact customer note; the ledger checks its approved response and original
numbered package; the new approval and issue package retain that lineage without
sharing internal IDs or AI analysis with the client.

| Gate | Verified result |
| --- | --- |
| API/ledger | Conversation API and formal variation tests verify original and client-revision provenance, response/package matching, replay, approved lifecycle, frozen-package lineage and client-side exclusion of internal analysis. |
| Interface | Focused React tests verify original source and approved revision request context, IDs/hashes, uncertainty and omission for unrelated evidence types. |
| Quality | Targeted ESLint and Vite production build pass. |
| Remaining limit | The UI display test is isolated from the full owner approval workflow; live model accuracy, hosted Postgres and external provider behavior remain unverified. |

## 2026-09-25 - Route Returned Variations to Office Follow-up

An internally verified client request for changes or rejection now appears as
a client-success action in the daily workbench. It links to the latest formal
revision and is deliberately not eligible for autonomous draft creation. If
internal review rejects a proposed revision, that latest rejected revision is
the follow-up source; the original approved client response stays in the
checksummed lineage. Creating and approving a later revision supersedes all
earlier revisions in the same chain while retaining their individual approval
outcomes. Stale/non-latest revision sources are rejected, and no client message,
scope, price, schedule commitment or work authorization is made automatically.

| Gate | Verified result |
| --- | --- |
| Ledger/workbench | Formal variation and command-workbench tests cover customer change requests and rejection, non-autonomous routing, internal approval rejection, next-revision lineage, ancestor supersession and diagnosis integrity. |
| Interface | Contractor workbench React test confirms the action opens its job and never offers the autonomous draft control. |
| Remaining limit | Browser testing is still required for the combined operator path; no live model, external issue/communication provider, hosted PostgreSQL or deployment claim is made. |

## 2026-09-25 - Gate Operational Completion on Current Work Evidence

Completion requests now retain a source-bound operational readiness snapshot.
Open execution tasks, linked material blockers, unresolved safety/site/quality
blockers, and open disruption-recovery cases prevent the completion approval
from being applied. The approver sees named blocker groups and separate follow-up
warnings. Approval rechecks the current ledger state inside the same transaction;
new blockers or changed source state leave the approval pending and the job
unchanged, requiring a fresh review request.

Operational completion remains distinct from customer acceptance, handover
delivery, invoicing and payment. Outstanding selections, variations and
receivables are presented as follow-up warnings, not misrepresented as physical
work blockers or treated as settled by job completion.

| Gate | Verified result |
| --- | --- |
| API/ledger | Dedicated completion-readiness tests verify open-task blocking, pending approval preservation, source-change refusal, and customer-decision/receivable separation. |
| Interface | Approval review shows operational blockers and distinct handover/commercial warnings without dumping the nested assessment as raw JSON. |
| Remaining limit | Imported or previously completed jobs retain their historical status; this gate governs new approval-based completion transitions. It does not yet provide final contractual closeout or customer-acceptance aggregation. |

## 2026-09-25 - Route Equipment Outages Through Operational Recovery

The office can associate an equipment reservation with one active task. When
the reserved tool is marked unavailable, fails its inspection gate, or has a
pending retirement decision, it appears as an equipment-disruption source in
that job's recovery workspace. The source retains the tool, reservation window,
task link, inspection state and schedule projection. The office can assign a
recovery owner and choose equipment recovery without releasing the reservation
or changing the schedule automatically.

An open recovery case cannot be resolved while its active reservation still
depends on unavailable equipment. Completing maintenance, passing inspection,
clearing the retirement gate or releasing the reservation changes the source;
the prior case then requires explicit source reassessment before evidence-backed
closure. A resolution review records the checked equipment and linked task state.
There is no automatic substitute, rental, supplier order, assignment or customer
communication.

| Gate | Verified result |
| --- | --- |
| Ledger and recovery | Operational-recovery tests verify active-task ownership, maintenance blocking, stale-source detection, explicit reassessment, resolution evidence, replay/integrity and readiness after repair. |
| Interface | The resource planner can link a reservation to a task; recovery identifies the unavailable tool, reserved window, inspection status and affected task, with a specific equipment-recovery action. |
| Remaining limit | The reservation-to-task link is one-to-one and optional. The signal covers registered canonical equipment and existing reservations only; it does not diagnose a fault or model fleet-wide replacement feasibility. |

## 2026-09-25 - Durable Source-Bound Client Conversation Analysis

When local AI and its separate auto-analysis opt-in are both enabled, active
conversations with unreviewed inbound client messages are submitted to a durable
ledger queue. Each job is bound to the conversation source hash, local model,
vision setting, context budget and analysis version. A lease prevents concurrent
duplicate workers; retries use bounded exponential backoff and stop after eight
attempts. Model output is retained only after access, consent and exact source
version are rechecked. New messages or changed model settings supersede old work.
The queue stores identifiers, hashes, bounded status and errors, not duplicated
conversation text or photo bytes. Analysis remains an internal proposal and
cannot create an RFI, change a task, issue a reply, approve a change or send to
the client. The office sees queue and retry state and can still request a
manual analysis.

| Gate | Verified result |
| --- | --- |
| Queue and processor | Local tests cover exact-source processing, startup-persistent queue records, lease exclusion, idempotent enqueue, bounded backoff, terminal retries, source change during inference, privacy boundaries and analysis opt-in. |
| Conversation/API | Conversation routes, private photo handling, AI source provenance and operator/customer authorization tests passed. |
| Backup | SQLite backup verification now checks the migration-090 queue table, indexes, hashes, state and lease consistency. Older backups remain eligible for forward migration. |
| Interface | The office conversation shows queued, running, retry and terminal states; it polls status instead of starting duplicate model requests from each browser tab. |
| Remaining limit | SQLite local execution and fixtures are verified; no live Ollama quality/availability, configured PostgreSQL execution, hosted scheduling, WhatsApp provider, or deployment acceptance is claimed. Automatic analysis remains off by default. |

## 2026-09-25 - Carry Historical Supplier Delay Risk into Recovery

The operational-recovery material view now joins an issued, still-open purchase
order to the supplier's retained completed-order history. When at least three
completed issued orders support a historical P75 lead time and that comparison
falls beyond the current order's required-by date, the affected material and
task readiness view shows the sample size, historical comparison date, and
required date. This is a historical risk signal, not an ETA or probability.
It does not change stock, expected availability, work sequencing, purchase
orders, or customer commitments. A change in supplier history changes the
recovery source hash, requiring an open case to be reassessed.

| Gate | Verified result |
| --- | --- |
| Ledger and supplier signal | Supplier-performance tests verify P75 risk and minimum sample size; operational-recovery tests verify the signal is joined to an issued order and a changed historical sample invalidates the retained source. |
| Interface | Focused recovery React test verifies the historical comparison, sample count, and explicit no-ETA wording. |
| Quality | The focused Node/API/supplier set passed (21/21); the recovery interface passed (13/13); ESLint and Vite production build passed. |
| Bundle budget | Existing release gate remains failed: aggregate gzip is 611,699/578,500 bytes; client delivery 8,549/8,500; operational replacement plan 1,614/1,600; operational recovery actions 914/900. Limits were not raised. |
| Remaining limit | Historical company-level supplier behavior can be sparse or non-comparable to a specific item/route. No forecast, order, delivery promise, or contract-date change is made; PostgreSQL-hosted execution remains unverified here. |

## 2026-09-25 - Precompressed Brotli Delivery for Web Assets

The production build now emits Brotli sidecars for hashed JavaScript and CSS.
Express serves these only when the request accepts Brotli, keeps the original
asset MIME type and immutable cache policy, varies responses by
`Accept-Encoding`, and otherwise leaves existing gzip negotiation and static
delivery unchanged. This lowers measured compressed transfer for the built
JS/CSS set from 611,699 gzip bytes to 528,438 Brotli bytes. The bundle verifier
now enforces a separate 540,000-byte Brotli cap; the original 578,500-byte gzip
cap and its current failure remain visible and unchanged.

| Gate | Verified result |
| --- | --- |
| Production build | Vite emitted Brotli variants at quality 10 alongside the normal hashed assets; the standard build completed. |
| HTTP delivery | The static-performance test passed for Brotli response headers, JavaScript MIME type, `Vary`, immutable caching, and the existing gzip fallback. |
| Bundle budgets | Brotli is within its new 540,000-byte cap (528,438); the existing gzip and three feature limits still fail and must be reduced before the full bundle gate passes. |
| Remaining limit | This is local production-build and HTTP-test evidence only; CDN/proxy negotiation and live hosted transfer were not tested. |

## 2026-09-25 - Dynamic Status Localization and Dutch Catalog Compaction

The equipment register exposed a raw English `checked out` state in a Dutch
operator session. The shared status formatter now translates both
`checked_out` and `checked out`. Production locale compaction now keeps Dutch
catalog values only and preserves each compacted literal's English fallback at
its callsite, including wrapped translators and fallback-only operator labels.
The operator-locale gzip asset dropped from 77,962 to 52,037 bytes. The summed
size of all independent gzip assets increased by about 4.2 KB because fallback
strings moved into lazy feature chunks; the full aggregate gzip gate therefore
remains red and was not relaxed. Brotli is 532,330/540,000 bytes.

| Gate | Verified result |
| --- | --- |
| Locale compactor | Babel compactor tests verify tokenized calls, dynamic-key retention, Dutch-only compact values and English fallback propagation through wrapped translators. |
| UI | Full production browser flow verified the Dutch equipment custody status, successful return action, and English locale round trip. |
| Regression | Full frontend suite passed (175/175); focused locale, Android-source and release contract Node tests passed (22/22); ESLint and production build passed. |
| Bundle | Operator locale gzip is 52,037 bytes (down 25,925); total gzip is 615,872/578,500; Brotli is 532,429/540,000; client delivery 8,549/8,500; replacement plan 1,616/1,600; recovery actions 915/900. No limits were increased. |
| Android | Native source contracts pass, but no APK or emulator/device acceptance is claimed: this host lacks JDK 17, Android SDK platform 35 and adb. |

## 2026-09-25 - Searchable Job Register

The contractor workspace now lets office and field users find jobs by title,
client, location or identifier using the existing `/api/ledger/jobs` search
contract. The recent list stays the default; clear-search returns to it. The
search control reports loading, errors, empty results, and its 500-most-recent
candidate bound. Company context and server-side field assignment scope are
preserved. Search does not yet provide cursor pagination or claim exhaustive
historical coverage.

| Gate | Verified result |
| --- | --- |
| Component behavior | Search, empty-result recovery and failure isolation passed (3/3). |
| Production browser | Built-app Chromium test inserted 100 newer jobs, proved the target was absent from the default 100, then found it by title and verified Dutch localization (1/1). |
| Build and lint | Vite production build and ESLint passed. |
| Bundle | Existing limits remain unchanged: gzip total 617,007/578,500, client delivery 8,553/8,500, replacement plan 1,618/1,600, recovery actions 916/900. Brotli 533,206/540,000 passes. |

## 2026-09-25 - Complete Job Register Cursor Pagination

Follow-up to the bounded-search description above: job search is now
continuable across the complete ledger, not limited to 500 candidates. The API
uses deterministic keyset pagination (maximum 100 per page), and the register
supports next/previous navigation for both search results and recent jobs.
Field-worker visibility is filtered in the database before pagination, so
restricted records cannot distort page boundaries or leak through search.

| Gate | Verified result |
| --- | --- |
| Functional coverage | All 506 seeded jobs were traversed without a gap or duplicate; equal update timestamps sort deterministically; worker scope is applied before pagination; malformed partial cursors are rejected. |
| Regression and browser | Full Node suite: 793 passed, 47 skipped, 0 failed. Full frontend suite: 178/178. Production Chromium found an older matching job on search page 2 (1/1). Lint and production build passed. |
| Bundle | Existing thresholds remain unchanged: gzip total 617,310/578,500; client delivery 8,553/8,500; replacement plan 1,618/1,600; recovery actions 916/900. Brotli 533,573/540,000 passes. |
| Remaining limit | PostgreSQL runtime parity was not exercised because no test connection is configured. No commit, push or deployment. |

## 2026-09-25 - Local Conversation AI Refusal Safeguard

Added a deterministic check between local model output and retained client
messages: when a quoted source explicitly refuses approval, the model proposal
must preserve that non-approval and cannot ask for acceptance. Contradictory
output is rejected and permanently dead-lettered instead of being retained.
The local Ollama 0.33.3 / `qwen3:4b` adapter passed a synthetic live evaluation
for a refused EUR 1,200 increase and a separate measurement question after the
failure was found and addressed.

| Gate | Verified result |
| --- | --- |
| Durable safety | Model-conflict integration test verifies no analysis record is created and the queue records a permanent conflict. |
| Live local inference | Synthetic-only direct evaluation passed in 46,108 ms. A second run passed through the durable queue and temporary SQLite ledger in 54,885 ms with a completed queue item; 0 external commitments and human review remains required. |
| Remaining boundary | Process-local test configuration was restored. Persisted or running Contractor.AI provider settings were not changed, and this test did not enable automatic analysis in the app. This is not production-message, photo, general multilingual, or legal-safety acceptance. |

## 2026-09-25 - Trade-Safe Work Position Drafting

Uncovered executable tasks can now be prepared as private work-position drafts.
The drafts retain the task role, location, timing, duration and task-specific
materials, while leaving rate/capacity unknown unless an operator supplies
them. They are idempotent and remain unpublished until the existing release
workflow is used. Intake coordination checklist tasks are excluded from the
worker marketplace, including conservatively identified legacy records, and a
single opening cannot bundle tasks from incompatible trades.

| Gate | Verified result |
| --- | --- |
| Functional | Work-board/API tests 22/22; frontend suite 187/187; production Chromium drafting-to-worker-admission flow 1/1. |
| Regression | Full Node suite: 804 passed, 47 skipped, 0 failed. PostgreSQL-dependent cases had no configured test database. |
| Delivery boundary | Focused ESLint passed. No commit, push, production deployment, automatic publication, or external provider action. Existing aggregate bundle budget remains over threshold. |

## 2026-09-26 - Office Review of Client Completion Responses

Office users can now append an idempotent, rationale-bearing review disposition
to a customer's response to the exact delivered handover dossier. The review
history records who reviewed, when, which disposition was chosen, and whether
the underlying dossier was current. Changed-source responses require explicit
confirmation; escalation is available only when the client explicitly said
the work was not accepted. Review records are role-gated, audited, included in
exports and data-subject inventory, and their notes are redacted during
approved client pseudonymization. Neither client responses nor office reviews
change job, contract, invoice, payment or external communication state.

| Gate | Verified result |
| --- | --- |
| API | Handover package API tests passed (2/2), including office/field role boundaries, exact retry, stale-source rejection and explicit acknowledgment, export, and unchanged job status. |
| UI/build | Full frontend suite passed (193/193), ESLint passed, and Vite production build passed. |
| Regression | Full Node runner passed all 235 test files; no failures. PostgreSQL connectivity remains unavailable, so hosted database behavior was not exercised. |
| Hosted | PostgreSQL runtime and external/legal acceptance remain unverified. |

## 2026-09-26 - Cross-domain Contractual Closeout Overview

The office closeout workspace now combines current operational blockers,
handover readiness/delivery, client response and review freshness, formal
variations and client selections, reconciled client receivables and supplier
payables (grouped by currency), warranty claims, and aftercare. The derived
read-only assessment keeps these as separate domain states: open balances do
not imply that field work is incomplete, and a customer response with items is
not considered resolved merely because an office review was recorded. A stale
client response remains flagged. The office can refresh the assessment without
mutating source records; field-scoped accounts cannot read it.

The overall status is only an operational follow-up summary. Legal acceptance,
contractual closure and payment release are always returned as
`not_determined`. The feature does not approve changes, issue invoices, release
retention, close jobs, send messages or authorize payments.

| Gate | Verified result |
| --- | --- |
| API | Handover/client and operational-completion integration suites passed (3 tests), covering role denial, response-review state, source freshness, client selections, reconciled receivables, and explicit non-determination of legal/payment outcomes. |
| Interface | Focused closeout assessment tests passed (2/2); full frontend suite passed (195/195); ESLint and Vite production build passed. |
| Bundle budgets | Verification remains red: total gzip 636,816/578,500 bytes; total Brotli 550,579/540,000; client-delivery gzip 8,547/8,500; recovery case gzip 3,181/3,000; replacement plan gzip 1,614/1,600; recovery actions gzip 1,021/900. Limits were not raised. |
| Hosted/legal boundary | PostgreSQL runtime and jurisdiction-specific legal interpretation remain unverified. |

## 2026-09-26 - Change Impact and Customer Decision Binding

Change-impact previews now show the approved scope snapshot, recorded client
decisions, and explicit task-dependency edges alongside schedule and material
effects. Customer decisions are included in the retained analysis fingerprint:
resolving a choice makes the old analysis stale, while an unresolved question
does not pretend to replace or invalidate the current approved contract scope.
Approved selection states now participate in the commercial-scope source only
after their approval record is approved. The interface calls out that it does
not infer which choice maps to which task, material quantity, or contract term.

| Gate | Verified result |
| --- | --- |
| Domain/API | Contractor-review and commercial-scope tests passed (18/18), including approved-scope context, affected dependency disclosure, pending-versus-approved customer choice, and stale analysis after resolution. |
| Browser | Production-bundle mobile/desktop flow, Dutch/English rendering, and axe scan passed (1/1). |
| Regression and build | Full Node suite: 817 passed, 47 PostgreSQL-dependent tests skipped, 0 failed. Full frontend suite: 195/195. Repository ESLint, Vite production build, and the isolated work-board timing test passed. |
| Bundle gate | Existing limits remain unchanged and verification fails: gzip total 637,873/578,500; Brotli 551,436/540,000; client delivery 8,547/8,500; recovery case 3,183/3,000; replacement plan 1,615/1,600; recovery actions 1,023/900. No thresholds were raised. |
| Remaining boundary | Exact client-choice-to-task/material mapping and drawing-specific revision impact remain open; PostgreSQL and legal acceptance are not claimed. |

## 2026-09-25 - Warehouse Material Recovery

Active material-shortfall recovery now exposes exact-linked free warehouse stock
as a distinct source from supplier orders. An office operator can atomically
reserve and issue up to the current shortfall to a job site with stocktake,
dispatch, evidence and expected-arrival references. Exact command replay is
safe after a lost response. The source and schedule reflect the quantity in
transit, while supplier-order quantity remains separate; a field receipt is
still required before the material is treated as available on site. Changed
sources require explicit recovery reassessment.

| Gate | Verified result |
| --- | --- |
| Domain and API | Operational recovery and API suites passed (20/20); exact replay, linked catalog/unit checks, shortfall/free-stock limits, office authorization, field-role denial, ledger diagnosis and no external commitments verified. |
| Interface | Warehouse recovery component tests passed (2/2), including retained exact retry after an uncertain response and fail-closed unit mismatch. |
| Regression and build | Full Node suite: 810 passed, 47 PostgreSQL-dependent tests skipped, 0 failed. Full frontend suite: 190/190. Focused ESLint and Vite production build passed. |
| Bundle gate | Existing limits remain unchanged and the gate fails: gzip total 627,776/578,500; Brotli 542,858/540,000; client 8,551/8,500; replacement plan 1,616/1,600; recovery actions 1,025/900. No thresholds were raised. |
| Remaining boundary | No dispatch provider, live transport, field-device acceptance, PostgreSQL service, deployment, commit or push was exercised. |

## 2026-09-26 - Explicit customer-decision impact links

Office operators can explicitly connect a recorded customer decision to one or
more active tasks or material requirements on the same job. Each link requires a
reason, is idempotent and audited, and is validated against the current ledger.
Change-impact previews show the decision only when the selected scenario touches
its linked task or material requirement. Editing links reloads source context
and prevents an old preview from being mistaken for current analysis.

The relationship is an operator assertion, not an inferred construction rule.
It does not automatically change approved scope, quantities, task dates, orders,
or customer commitments. Internal rationale is not included in client-portal
responses; those return a limited public selection summary.

| Gate | Verified result |
| --- | --- |
| API/domain/security | Focused domain/API tests passed (16/16); role tests passed (6/6), including cross-job target rejection, idempotency, audit and office/owner access boundaries. |
| Privacy and interface | Client-portal privacy test passed; full frontend suite passed (196/196), including the Dutch operator mapping flow and scenario preview. |
| Regression/browser | Full Node suite passed (818 passed, 47 PostgreSQL-dependent skipped, 0 failed); repository lint passed; production Chromium scenario passed (1/1) after the final UI placement change. |
| Bundle gate | Existing limits remain unchanged and fail: gzip 639,120/578,500; Brotli 552,701/540,000; client delivery 8,547/8,500; recovery case 3,185/3,000; replacement plan 1,615/1,600; recovery actions 1,023/900. No thresholds were raised. |
| Remaining boundary | Hosted PostgreSQL, external/legal acceptance, deployment and native-device acceptance remain unverified. No commit, push or deployment was performed. |

## 2026-09-26 - Material impact traces supplier orders and receipts

When a change scenario alters a material requirement, the office analysis now
shows order lines explicitly attached to that exact requirement. It presents
supplier, order status, required-by date, ordered quantity, receipt totals,
accepted and damaged quantities, and outstanding quantity. A matching product
name alone is not treated as a relationship. Draft or otherwise unissued lines
are visible for review but do not count as material arriving; only an externally
issued order with a retained commitment contributes to incoming supply.

Receipt headers and receipt lines are now part of the analysis source snapshot.
New or changed delivery evidence therefore makes a retained impact analysis
stale. The workflow remains review-only: it neither edits purchase orders nor
creates extra supply, approval, schedule, or customer commitments.

| Gate | Verified result |
| --- | --- |
| Domain/API/receiving | Contractor-review API/domain and material-receiving tests passed (22/22), including exact material links, a same-name unlinked order, partially received line evidence, draft-versus-issued commitment handling, source staleness after a receipt, and no automatic writes. |
| Interface and accessibility | Full frontend suite passed (196/196); repository lint passed. Production Chromium desktop/mobile workflow passed (1/1) with the linked order visible and zero axe violations. |
| Regression | Full Node suite passed: 819 passed, 47 PostgreSQL-dependent tests skipped, 0 failed. |
| Bundle gate | Existing limits remain unchanged and fail: gzip 639,427/578,500; Brotli 553,083/540,000; client delivery 8,547/8,500; recovery case 3,182/3,000; replacement plan 1,612/1,600; recovery actions 1,023/900. No thresholds were raised. |
| Remaining boundary | Drawing revisions and takeoff-line relations still need explicit decision-impact paths. PostgreSQL hosted parity, legal acceptance and provider delivery remain unverified; no commit, push or deployment was performed. |

## 2026-09-26 - Client decisions link to measured items and drawing revisions

Decision-impact mapping now supports exact takeoff items and governed drawing
revisions, in addition to tasks and material requirements. The source snapshot
contains every controlled drawing revision for the job, so approval,
supersession, lineage, or evidence-integrity changes stale retained analyses.
Only a current, integrity-verified drawing can be linked to a client decision.

Impact previews accept an explicit pair consisting of a verified current sheet
and its exact verified pending replacement. The same sheet and supersession
lineage are enforced server-side. The preview identifies both revisions and the
pending approval state, and shows only client decisions explicitly linked to the
current revision. It does not publish the replacement or alter a takeoff, scope,
schedule, purchase order, or customer commitment. Once the new revision is
approved, the former revision becomes unavailable as a current target and
previous retained previews are marked stale from the source fingerprint.

| Gate | Verified result |
| --- | --- |
| Domain and controlled sources | Focused contractor-review suite passed (16/16), including current/pending drawing lineage, integrity checks, takeoff decision links, affected-decision matching and source invalidation after approval. |
| Interface | Focused ContractorReviewControl suite passed (8/8); new scenario displays proposed revision and pending approval without implying publication. |
| Quality | Full Node suite passed (820 passed, 47 PostgreSQL-dependent skipped, 0 failed); full frontend suite passed (197/197); repository lint and production build passed. Production Chromium workflow passed (1/1). |
| Bundle gate | Existing limits still fail: gzip 640,073/578,500; Brotli 553,560/540,000; client delivery 8,547/8,500; recovery case 3,184/3,000; replacement plan 1,613/1,600; recovery actions 1,024/900. Limits were not raised. |
| Remaining boundary | EU-hosted PostgreSQL parity and live provider/deployment acceptance remain unverified; no commit, push or deployment was performed. |

## 2026-09-26 - Released shifts flag missing check-ins for office review

The daily operating queue now derives an early check-in exception from a valid
released crew huddle. Only the huddle's exact assigned workers are considered,
and only when their current assignment is scheduled/active, its
start is at least 30 minutes past, its end has not passed, and no check-in or
check-out is retained. The warning is source-hashed against the huddle and
assignment window and asks the operator to confirm the situation; it is not a
no-show or illness determination. Once attendance is recorded, the action
disappears. Blocked or tampered huddles fail closed. Offline/unsubmitted
attendance can still produce a temporary review signal until sync.

| Domain/API/browser | Six focused daily-cycle domain/API tests pass, including office dashboard visibility, snapshot-tamper rejection and removal after attendance evidence. Three production Chromium workflows pass, including the office verification label, daily huddle/EOD flow and offline report sync. |
| Limits | No worker push/contact, automatic absence report, replacement, schedule change or customer commitment. Independent hosted PostgreSQL parity and unsynced-device acceptance remain unverified. Bundle budgets remain over their existing limits: gzip 641,447/578,500; Brotli 554,686/540,000; client delivery 8,548/8,500; recovery case 3,182/3,000; replacement plan 1,614/1,600; recovery actions 1,022/900. No budget was raised. |

## 2026-09-26 - Standby replacement respects worker notice needs

An admitted worker can set a 0-168 hour minimum notice on a standby window,
without supplying a personal reason. New standby windows require a known end;
unknown-return periods remain for hard unavailability. Existing standby records
default to zero.
The work board excludes candidates when an exact replacement offer would arrive
too late, and the server checks the retained notice value again when the worker
responds and when an independent approver resolves the replacement. Changing
the standby requirement after an offer therefore invalidates that stale offer.
This applies to replacement call-outs; standby still does not block or modify
existing assignments, and ordinary published-position enrollment is unchanged.

| Gate | Verified result |
| --- | --- |
| Domain/API | Focused availability, work-board and call-out API tests passed (38/38), covering retained/defaulted notice, legacy replay compatibility, bounded standby windows, candidate filtering, exact offer snapshots, fail-closed worker response and independent approval after a notice change. |
| Interface/quality | Worker and office component tests passed (21/21). Targeted ESLint, `git diff --check` and the Vite production build passed. |
| Offline field boundary | The encrypted Android queue now stores the same standby mode and notice term, but Android compilation could not run because this environment has no Java/JDK (`JAVA_HOME` unset and no `java` executable). |
| Remaining boundary | The full Node suite, production-browser accessibility, PostgreSQL parity, background notifications and any contact beyond the authenticated portal were not re-run or verified for this increment. |

## 2026-09-26 - Sudden absence cancels stale standby replacement approvals

When a standby worker reports a hard unavailability overlapping an offered or
accepted call-out, only that affected call-out is revoked. If a provisional
replacement and independent approval already exist, both are cancelled in the
same ledger transaction and retained in the audit chain. The original worker's
assignment remains unchanged, later non-overlapping call-outs remain current,
and the office must review the new absence before starting a fresh replacement
workflow. Suspending an account applies the same cleanup to all of that worker's
outstanding call-outs. The operational record contains no illness or personal
reason. The web portal reports the number of revoked call-outs immediately;
the encrypted Android offline receipt preserves and displays the same count
after a later authorized sync.

## 2026-09-26 - Compatibility client messages join the scoped conversation

New text posted through the legacy customer-portal endpoint now becomes a source
in the access-scoped conversation in the same ledger transaction. The existing
communication record and identifier are reused, its original timestamp is
retained, and an audit event records the link. The response remains compatible
with the old communication shape while also returning the canonical message and
explicitly reporting `notSent: true`. This adds no duplicate message, external
send, or public evidence URL. Pre-existing records remain untouched pending
recipient/access provenance review.

| Gate | Verified result |
| --- | --- |
| Client API | Integration test verifies the legacy response, same-ID canonical message and client-token-scoped conversation visibility. |
| Integrity | The legacy write, access binding, row linkage, source snapshot and audit records share one ledger transaction. |
| Remaining boundary | Historical imports, hosted PostgreSQL parity and any external delivery are not claimed. |

## 2026-09-26 - Explicit review of historical client messages

Office users can request a bounded list of older inbound portal text messages
for one active customer access link. A record is eligible only when its
retained portal-access identifier exactly matches that link. The owner/approver
role can import an eligible record individually into the canonical conversation;
the existing ID and creation time are preserved, audit/integrity records are
written, and repeating an import does not create a second message. Missing or
mismatched provenance is rejected and left unchanged. Listing is explicit, not
automatic, and no external message is sent.

| Gate | Verified result |
| --- | --- |
| Domain/API | Tests cover exact access scoping, unknown-provenance exclusion, unchanged rejection, same-ID/time preservation, idempotent replay, audit integrity and role boundaries. |
| Interface | Focused conversation UI tests pass (14/14), including explicit review, import affordance and no-send wording. |
| Quality | Full Node suite passed (826 passed, 47 PostgreSQL-dependent skipped, 0 failed); repository lint and production build passed. |
| Remaining boundary | Historical messages without exact retained access provenance remain unavailable for import. Hosted PostgreSQL parity and production-browser acceptance were not verified. |

## 2026-09-26 - Opportunity capacity checks use dated crew demand

An opportunity's estimated trade hours can now be split across explicit
workdays in the expected delivery window. The ledger rejects duplicate or
out-of-window dates and any day allocation that does not reconcile to the
trade total. Bid review compares each dated demand with the retained profile
capacity after current allocations, assignments and availability. A total-only
forecast remains unknown and cannot pass the capacity gate; a daily peak can
block even when the aggregate window has enough hours. The result is still only
a capacity comparison: it does not cover skills/credentials, route time, task
dependencies, materials, supervision or unregistered workers, and it never
reserves or assigns workers.

| Gate | Verified result |
| --- | --- |
| Domain/API | Tests cover day-by-day remaining hours, total-only unknown state, daily peak shortfall, and duplicate/out-of-window/non-reconciling demand rejection. |
| Interface | The opportunity editor captures dated hours per trade; bid review shows daily demand and known hours, including daily shortfalls. |
| Quality | Full Node suite passed (829 passed, 47 PostgreSQL-dependent skipped, 0 failed); full frontend suite passed (201/201); repository lint and Vite production build passed. |
| Browser | Isolated production-bundle opportunity pipeline workflow passed (1/1), including dated-hour entry, ledger persistence and opportunity-to-job conversion. |
| Remaining boundary | PostgreSQL parity and production acceptance remain unverified. |

## 2026-09-26 - Opportunity material readiness and pipeline contention

Opportunity editors can now add material estimates by exact company-catalogue
ID, quantity and matching unit. A read-only catalogue endpoint exposes only
stock identity and quantities needed by that editor. Bid review compares each
need with counted warehouse stock less active job reservations, and separately
shows demand from other open opportunities that have not yet become jobs.
Unknown catalogue IDs and unit mismatches remain unknown; a shortfall against
physical stock is distinct from contention across the open pipeline. Neither
opportunity reserves inventory, counts future deliveries or triggers a purchase.
The inventory and open-pipeline basis is included in the bid decision source
hash, so an approved decision becomes stale when the basis changes. Conversion
atomically creates exact linked job material requirements and removes the old
opportunity from competing demand. A vanished material ID or changed unit
rolls back the entire conversion; replay creates no duplicate job or need.

| Gate | Verified result |
| --- | --- |
| Domain | Tests cover exact stock, active reservations through the shared ledger projection, pipeline contention, material shortfall, changed source hash, stale approved decision and input validation. |
| Interface/API | Read-only minimal stock-catalogue API test passes; browser flow creates a physical count, selects the material, saves and verifies its exact persisted quantity and unit. |
| Quality | Focused bid-decision, stock API and opportunity conversion tests pass; full Node suite passed (832 passed, 47 PostgreSQL-dependent skipped, 0 failed); frontend passed (201/201); repository lint and Vite production build passed. |
| Browser | Isolated production-bundle opportunity pipeline workflow passed (1/1), including catalogue load, material selection and ledger persistence. |
| Remaining boundary | This check is not a supplier commitment, procurement plan, reservation or guarantee of later physical availability. Future receipts and alternatives are not forecast. Hosted PostgreSQL parity and production acceptance remain unverified. |

## 2026-09-26 - Required qualifications now flow from opportunity to job

Each forecasted trade can record required qualification keys from a minimal,
read-only catalogue. The dated capacity assessment checks exact trade-role
matches against approved credential evidence and its integrity snapshot on
working dates. Missing, pending, expired, or tampered evidence contributes no
capacity; evidence changes invalidate retained bid approvals. The opportunity
editor retrieves only catalogue key/label pairs, not the worker qualification
register. Conversion carries the forecast into mandatory, role-specific job
qualification requirements inside the same transaction as job and material
creation. Existing assignment, access and start checks then enforce that same
requirement. No certificate is verified automatically and no worker is assigned.

| Gate | Verified result |
| --- | --- |
| Domain | Tests cover missing proof, approved proof, exact role match, dated capacity, source staleness, invalid/duplicate requirement keys, and replay-safe job requirement conversion. |
| Interface/API | Opportunity editor loads a minimized qualification catalogue; browser workflow selects VCA and verifies the exact mandatory job requirement after conversion. |
| Quality | Full Node suite passed (833 passed, 47 PostgreSQL-dependent skipped, 0 failed); frontend passed (201/201); repository lint passed. |
| Browser/build | Production-bundle opportunity-to-job workflow passed (1/1) with qualification selection; its build succeeds with the existing 600 kB app-chunk warning. |
| Remaining boundary | Role matching is exact text, not verified trade skills; travel, task dependencies, supervision and unregistered workers remain outside this acquisition check. Hosted PostgreSQL parity and production acceptance remain unverified. |

| Gate | Verified result |
| --- | --- |
| Domain | Regression test passes for accepted-callout invalidation, atomic approval/provisional assignment cancellation, unchanged original assignment, preservation of a non-overlapping offer, integrity verification and suspension cleanup. |
| Interface | Worker-facing test verifies the privacy-neutral notice explaining revoked offers and office review. |
| Remaining boundary | Focused local tests only; the full Node suite, hosted PostgreSQL parity and production browser/device acceptance remain unverified. No external notification, provider action, commit or push was performed. |
## 2026-09-26 - Worker-requested release of an assigned position

An admitted field worker can request review of release from an assigned
work-board position when an unexpected disruption makes the placement
unworkable. The form uses a small reason category (unexpected unavailability,
family care, travel/site issue, or other); it does not invite or retain
medical/family narratives. Repeating the same pending request returns the
existing approval. The assignment, schedule, and work-pack access remain
unchanged while review is pending.

An office approval rechecks the exact assignment snapshot and the linked
application. A changed or no-longer-active placement fails closed, and a
checked-in worker must be checked out before approval. Successful approval
releases the assignment and marks the worker-board application released in the
same ledger transaction. Rejection leaves the placement intact. This creates no
replacement, customer-date change, external message, or automatic safety
clearance; coverage still needs to be reviewed through the existing recovery
and replacement workflow.

Focused Node/API and interface tests passed locally. A production-bundle
Chromium mobile workflow also verified request, office approval, atomic
placement closure, retained pending access, and removed post-release access.
Hosted PostgreSQL parity and independent field-user acceptance remain pending.

## 2026-09-26 - Position scope reaches the field work pack

Work-board placements now preserve their exact linked task IDs even when they
do not require a separate start release. The mobile field pack uses those
retained links to limit shared job tasks, task-derived context, progress
eligibility, and task-linked quality/photo controls. Tasks directly assigned to
the worker or assigned to them as supervisor remain visible. Materials and
dispatched site issues are included only when explicitly linked to those tasks.
Older positions with no explicit task links keep the previous shared-task
behavior, rather than pretending that an unrecorded scope is complete. Drawing
and equipment-reservation scope is not yet mapped in the same way.

| Gate | Verified result |
| --- | --- |
| Domain | Focused regression confirms the assignment retains its position/task IDs and the work pack excludes unrelated tasks and unlinked material requirements. |
| Compatibility | Existing positions without task links retain shared-task visibility; work-board enrollment/progress API tests pass. |
| Quality | Focused work-board, field-pack, and API Node suite passed (38/38). |
| Remaining boundary | Drawing/equipment scope, universal subcontractor isolation, hosted PostgreSQL parity, and independent field acceptance remain unverified. |

## 2026-09-26 - Governed drawings follow position task scope

The office drawing register can now bind a revision to specific tasks. The
canonical task IDs participate in the drawing's source basis, approval snapshot
and replay fingerprint, so changing the scope invalidates the integrity check.
A replacement revision inherits the current links by default; an explicit
empty selection removes them. Linked tasks must belong to the same job and the
list is bounded at 50.

For positions with an explicit task scope, the field pack includes only current,
approved drawings linked to tasks visible in that pack. Whole-job and unrelated
drawings are omitted. Legacy placements without explicit task IDs retain their
existing behavior. Equipment reservations and universal subcontractor-company
isolation are tracked separately below.

| Gate | Verified result |
| --- | --- |
| Domain | Drawing revision, replay, cross-job validation and scope-inheritance regressions pass. |
| Field pack | A position-scoped pack includes only the drawing linked to its visible task; unrelated-task and whole-job drawings are excluded. |
| UI | Drawing-register browser flow selects a linked task and confirms a replacement draft inherits the selection. |
| Remaining boundary | Hosted PostgreSQL parity, universal subcontractor isolation, equipment scope and independent field acceptance remain unverified. |

## 2026-09-26 - Equipment reservations follow task scope

The existing office resource planner already lets the operator attach a
reservation to a job task. The field pack now reuses that exact relation:
position-scoped packs include only active reservations whose task is visible to
that worker. Unlinked reservations and reservations for other tasks are omitted;
released, returned, or otherwise closed reservations are no longer presented as
requirements.

For active custody, the field pack returns only the reservation's custody state,
due-back time and whether the current worker has it. It does not expose another
worker's identity. Placements without an explicit task scope keep their prior
active equipment overview.

| Gate | Verified result |
| --- | --- |
| Domain | Regression verifies linked reservations are shown, unrelated and unlinked reservations are withheld, and returned reservations disappear. |
| Privacy | Field projection omits peer identity while retaining the current worker's own custody boolean. |
| Remaining boundary | Hosted PostgreSQL parity, broader subcontractor-company isolation, and independent field acceptance remain open. |

## 2026-09-26 - Private field production and approved submittals

Production lines now bind to a task from the same job. A field worker's job
projection and production endpoints show only lines linked to currently visible
tasks and only that worker's production entries; attempts to submit a peer's,
unlinked or otherwise invisible line are rejected. Office can map lines in the
baseline editor. A retained production line cannot later be moved to another
task, and the API test exercises replay, peer output, aggregate privacy and
approval-gated reversal.

The generic field job dossier also filters submittals by both operational state
and their exact approved ledger decision. Its field shape omits attachments,
internal reviewer/responsible-party fields and approval metadata. Unapproved
records remain available to office roles only.

| Gate | Verified result |
| --- | --- |
| Domain/API | Production and field API/work-pack regressions pass (6/6); same-job task validation and retained task-link immutability are covered. |
| Interface/browser | Production baseline task-link UI test passes (1/1); isolated Chromium production workflow passes (1/1), including baseline approval and output recording. |
| Field submittals | Field work-pack, field assurance and lifecycle suite passes (4/4), including exclusion of drafts and removal of private submittal details. |
| Quality | Repository lint and production build pass. The build retains its existing app-chunk size warning; bundle budgets were not increased. |
| Remaining boundary | Task-level submittal links, hosted PostgreSQL parity and independent field-user acceptance remain unverified. No external provider, commit, push or deployment was used. |

## 2026-09-26 - Approved field JHA projection

The general field dossier no longer returns draft or pending job hazard
analyses. It checks the exact approval row and returns only released JHAs, with
the safety content needed on site: work method, hazards, controls, required PPE
and stop-work triggers. Internal notes, assignee and approval metadata remain
office-only. The API regression exercises both an excluded draft and a released
JHA, including the safe projection shape.

Task-level JHA links are not yet modeled, so approved JHAs remain job-wide.
Hosted PostgreSQL parity and independent field acceptance remain open.

## 2026-09-26 - SDS release checks and field knowledge view

SDS records in both the generic field dossier and mobile work pack now require
current status, unexpired validity, intact source/document integrity and the
exact approved SDS decision. The worker receives the product identity and
practical emergency/control information; replay hashes, approval references,
stored payload and internal metadata stay out of the field shape. The “Know”
tab renders hazards, PPE, first aid, fire, handling/storage, spill response,
disposal, emergency contact and expiry for approved sheets.

API tests reject an unapproved legacy record marked current and retain the
approved one; a frontend test verifies the safety content is visible. SDS
records remain job-wide until a governed task/material relationship is added.

## 2026-09-26 - Governed SDS PDFs online and offline

The field work pack now carries only bounded PDF metadata for an SDS document
that passed the existing current, approval and integrity projection. Its
download endpoint requires the named worker's active assignment and the exact
current work-pack hash, rechecks the approved sheet and file after storage read,
and serves only an intact PDF up to 8 MB. The online “Know” view downloads the
verified PDF; the encrypted offline vault now stores SDS PDFs beside drawings,
with 50 files and 12 MB combined limits.

API tests verify successful retrieval, stale hash, spoofed identity, cross-job
access and superseded revision denial. Offline tests verify route, checksum and
combined limits. Work-pack hashes change when released SDS document metadata
changes, requiring refresh before new responses.

## 2026-09-26 - Scope approved SDS to task materials

Governed SDS revisions now retain sorted material-requirement IDs in a new
snapshot format, approval basis and idempotency fingerprint. Existing v1
snapshots remain valid and unchanged. Replacement revisions inherit source
material links unless the operator explicitly changes or clears them; every
selected material must remain an active requirement on the same job.

For assignments tied to explicit work-board task scope, the worker work pack,
field job detail, job/global SDS lists and SDS PDF download now include only
approved current sheets linked to material requirements used by visible tasks.
Unrelated product sheets and cancelled material references are withheld. The
office register offers material checkboxes and displays current links. Legacy
unscoped assignments preserve job-wide delivery of approved sheets.

## 2026-09-26 - Material SDS applicability and release gate

Active material requirements now record an audited SDS-applicability status
(`unreviewed`, `required`, or `not_required`), rationale, reviewer and stable
replay key. Only owner/approver roles may record that an SDS is not required;
an active pending or current approved sheet cannot be waived. Creating an SDS
revision marks its linked materials required immediately, so pending approval
cannot leave a material treated as exempt.

The field work pack now blocks start release if material applicability remains
unreviewed, a current approved bounded SDS PDF is missing, or that PDF is not
part of an assigned pre-task safety plan. The office register and online field
knowledge view display this state, including mobile layout and Dutch labels.
API, frontend, lint and production-browser tests passed locally. Hosted
PostgreSQL parity and independent field acceptance remain open.

## 2026-09-26 - Durable notifications for field workers

The worker work board now has a durable, account-scoped inbox for actionable
standby call-outs, position offers and confirmed placements. Unread counts and
read state persist in the ledger; workers can mark notices read, and the API
does not disclose notices belonging to another worker. Existing authenticated
polling refreshes the inbox while the board is open, while retained records
remain available after a browser or server restart. Offer notices include the
planned date/time, duration, city and response deadline. Placement notices
include the exact job address, scheduled window and allocated hours, explain
that placement is not start authorization, and link directly to the worker's
own placement list.

Verification: focused work-board domain/API/standby call-out suites pass
(26/26), the worker-board component suite passes (12/12), targeted lint passes,
and the production-bundle mobile worker workflow passes (1/1), checking the
rendered notice and anchor navigation. Production build succeeds with the
existing 602.04 kB main-chunk warning. PostgreSQL parity, native device
acceptance and external/background push remain unverified. No commit, push or
deployment was performed.

## 2026-09-26 - Offline continuity for worker notifications

The encrypted offline field vault now retains a bounded worker-inbox snapshot
beside the downloaded work packs. Only worker-visible title, body, type, date
and read state are retained; notification action links and internal source or
worker IDs are omitted. Offline view labels the snapshot time and warns that
new notices and changes cannot arrive offline. Saving a work pack captures the
current inbox; only an explicit online synchronization refreshes the snapshot
after processing the response queue. No decision or start permission is
available from the offline copy.

The inbox endpoint now accepts a configured company field-worker session by
its authenticated worker scope, while identity-linked sessions are verified
against their reviewed work-board membership. Other roles are rejected and
read state remains worker-scoped.

Verification: offline snapshot/rendering tests pass (7/7), work-board API
authorization tests pass (2/2), and the production-bundle mobile company
offline workflow passes (1/1), covering saving, offline reopening and explicit
sync refresh. PostgreSQL parity, native-device acceptance and push delivery
remain unverified.

## 2026-09-26 - Fail closed on changed field authorization sources

The field work pack previously filtered out both ordinary scope changes and the
separate review-required projection for accepted variations that had lost
integrity or authorization. The review list now retains those records without
exposing their unverified scope text, shows the office-review warning to the
assigned worker, and blocks start release until review. Work-pack source changes
also make any old acknowledged release non-current; a material SDS readiness
change is covered by a regression proving that the prior release no longer
permits work. Local SQLite/API/domain tests pass. Hosted PostgreSQL parity and
independent field acceptance remain open.

## 2026-09-26 - Standby call-out lifecycle notifications

When a worker reports new unavailability, affected pending standby call-outs
are revoked in the same ledger transaction as the availability change, and the
worker receives a retained inbox notice. When an offer actually expires, the
expiry transition likewise creates an idempotent notice. Both notices explain
which job/trade/window changed without copying the personal reason for the
availability report. They appear in the same durable inbox and therefore in
the next explicitly refreshed encrypted offline snapshot; offline copies do
not authorize a response or work start.

Verification: focused work-board and standby API suites pass (25/25), including
transactional invalidation, expiry idempotency and sensitive-reason exclusion;
targeted ESLint passes. PostgreSQL parity, native-device acceptance and
background push remain unverified.

## 2026-09-26 - Approved field answers reach the worker

An office answer to a retained work-pack question remains hidden until its
governed RFI approval resolves as approved. In that same transaction the worker
receives one durable, idempotent `field_reply` inbox notice containing the
released answer, but not internal approval notes. Replaying an approval does
not duplicate the notice; pending, rejected and unrelated RFI decisions do not
create one. The existing scoped work-pack reply view remains the authoritative
conversation state, while the inbox gives the worker a durable cross-job alert.

Migration 095 extends the local SQLite notification constraint without losing
existing inbox records and adds the equivalent PostgreSQL constraint change.
Verification: focused field-pack, work-board and approval tests pass (47/47),
worker-inbox UI tests pass (12/12), and targeted ESLint passes. PostgreSQL execution of the migration, native-device
acceptance and external/background push remain unverified.

## 2026-09-26 - Versioned dossier-review coverage evidence

Each portfolio review now retains a versioned manifest alongside the dossier
findings: row counts for 15 configured job-scoped tables, seven derived source
sets and the ten current review controls. The durable round includes that
manifest version and counts dossiers without complete evidence; it cannot report
complete coverage after a failed inspection, missing manifest or changed dossier
inventory. Interrupted progress from an older version restarts rather than
reusing reports that lack proof. The dashboard exposes the manifest scope and
missing-evidence count.

This makes coverage auditable only for manifest v1. It is not a full-company or
safety certification, does not claim every ledger domain is covered, and does
not yet cursor-page individual very large source registers. Verification:
contractor-review/domain/API suites pass (18/18), review-control UI tests pass
(9/9), and targeted ESLint passes. Hosted PostgreSQL and production acceptance
remain unverified.

## 2026-09-26 - Worker position discovery

The worker board can now search published position text and filter by trade,
with a live result count and an explicit no-results state. Search covers title,
place, role, description, materials, equipment, prerequisites and additional
skills. The mobile view stacks the controls above the position list. This only
filters positions already returned to the authenticated worker; server-side
eligibility, admission, placement, address privacy and start authorization are
unchanged.

Verification: focused worker-board frontend tests pass (25/25); the production-
bundle mobile registration-to-placement browser workflow passes, including
position filtering, axe accessibility checks, and horizontal-overflow checks;
targeted ESLint and production build pass. The main JavaScript chunk remains
about 602 kB and triggers the existing build warning. Hosted PostgreSQL and
independent field-user acceptance remain unverified. No commit, push or
deployment was performed.

## 2026-09-26 - Public-position privacy gate

Position release now checks every worker-visible text field against the known
client name/company, exact job/client address, email and phone. A possible match
blocks the server-side publication transaction. The response reports only the
matched data category, never the private value; ordinary public city-only
content remains releasable. This is targeted matching, not general DLP, and it
does not retroactively withdraw or rewrite previously published terms.

Verification: work-board domain/API suites pass, including formatted phone,
punctuated address, case/line-break-normalized client name, email, and safe
publication. Targeted ESLint, production build and the production-bundle mobile
registration/filter/enrollment/work-pack browser workflow pass, including axe
and overflow checks. Build retains the 602.05 kB main-chunk warning. The native
Android APK remains uncompiled because this machine has no JDK or Android SDK;
the repository does not accept SDK terms. No commit, push or deployment was
performed.

## 2026-09-26 - Approval-bound task scope for field submittals

Office can associate a submittal with up to 50 tasks from its own job. A blank
task set means the approved reference applies job-wide; a task-linked reference
is delivered only to a scoped field work pack that includes at least one of its
linked tasks. The contractor register and approval preview show this scope.
Approval now checks the pending record against the exact requested task set and
validates that those tasks still belong to the same job. Field projection checks
the approved decision's task set again, so post-approval scope tampering hides
the reference. Cross-job task IDs are rejected at creation.

Verification: the focused field work-pack API regression passes (1/1), including
cross-job rejection, task-scoped inclusion/exclusion, a scope change during
pending approval, and post-approval tampering; the submittal UI test passes
(1/1); targeted ESLint and the production build pass. Build reports the existing
large main chunk at 602.85 kB. Hosted PostgreSQL parity and independent mobile
field acceptance remain unverified. No commit, push or deployment was performed.

## 2026-09-26 - Approved submittal documents in online and offline work packs

The authenticated field work pack now projects released submittals only when
the record's task and attachment sets still exactly match their approval. A
task-scoped worker sees only job-wide or matching-task packages, with visible
task titles and minimal PDF metadata. Arbitrary attachment strings do not grant
access: a document must be retained in the same job, be a PDF, have a verified
SHA-256 digest, and fit the 8 MB per-file ceiling. New scoped, no-store download
routes recheck named worker identity, current approval, task/attachment scope and
work-pack source hash both before and after storage retrieval. The phone Know
view offers verified download; encrypted offline packs retain the file under
the existing combined 50-file/12 MB limit and display it from the encrypted
vault. The office UI selects verified PDFs from the current job rather than
accepting free-text attachment references; pre-existing arbitrary references
remain historical only. The UI makes explicit that a submittal does not change
task scope, price, dates or start permission.

Verification: field work-pack service and offline-download suites pass (20/20),
field work-pack/offline UI suites pass (24/24), submittal attachment UI tests
pass (2/2), the authenticated API integration passes (1/1), targeted ESLint
passes, and the production-bundle browser workflow passes (1/1), uploading a
PDF, selecting it for a submittal and confirming its retained document ID.
SQLite is covered; hosted PostgreSQL parity, production rollout and independent
field acceptance remain unverified. No commit, push or deployment was performed.

## 2026-09-26 - Package-linked closeout projection

The office closeout assessment now joins each active work package to its
measured remaining quantities, linked task state, partial delivery state,
inspection/coverage, reviewed client response and finance status. Billing
milestones now belong to at most one active delivery; their total and linked
invoice receipt/balance are shown at delivery level. A legacy duplicate is
flagged and its invoice balances withheld pending operator correction, while
job-wide receivables remain the sole aggregate. The work-package aggregate
distinguishes unconfigured work, required allocation, pending review,
source/reconciliation issues, and fully current balances. Legal acceptance,
contractual closure and payment release remain explicitly undetermined and the
assessment remains read-only.

Verification: focused Node delivery/readiness and API tests pass (9/9), focused
closeout UI tests pass (2/2), targeted ESLint passes, and the production-bundle
browser workflow passes (1/1). The browser scenario verifies offline capture
and one-record retry, approval-gated punch resolution, warranty and aftercare
creation and completion, Dutch/English rendering, and mobile horizontal
overflow. The production build succeeds with the existing 602.96 kB main-chunk
warning. Hosted PostgreSQL, production rollout and operator/legal acceptance
remain unverified. No commit, push or deployment was performed.

## 2026-09-27 - Recheck subcontractor access after assignment

Targeted assignments now revalidate the worker's active owner-verified
subcontractor membership when listing and retrieving field work packs and when
projecting job details or assignment-related inbox notices. If verification is
suspended or membership changes, the worker no longer receives private job or
work-pack details; the inbox notice is reduced to a generic unavailable state.
Pre-placement offers remain available only to their intended eligible worker.
Legacy role-token job listings remain read-scoped, but progress mutations
require a named worker identity.

Verification: focused work-board and field-work-pack Node/API tests pass
(60/60), the legacy role-scope regression passes, and targeted ESLint passes.
Company isolation for all other data surfaces, hosted PostgreSQL parity and
independent subcontractor acceptance remain unverified. No commit, push or
deployment was performed.

## Subcontractor recovery boundary

An assignment created from a company-targeted work-board position now carries
the required verified subcontractor identity into absence recovery. Standby
candidate discovery, replacement requests and independent approval all
revalidate that company membership and its active status. Replacement chains
preserve the same boundary. Legacy position-linked assignments validate the
position's current canonical scope before recovery is offered.

Manual call-outs may remain open for multiple candidate jobs so the contractor
can coordinate coverage; a worker can accept only a non-overlapping call-out.
Autonomous call-outs are stricter and do not offer one worker overlapping jobs.
Focused replacement, standby, availability and work-board tests passed
(60/60); targeted ESLint passed. Broader company-data isolation, hosted
PostgreSQL parity and independent subcontractor acceptance remain open. No
commit, push or deployment was performed.

## 2026-09-27 - Owner-verified subcontractor positions

Contractors can now link a registered worker account to an active subcontractor
record after retaining a verification reference. Self-entered company names and
registration-supplied company IDs grant no access; a non-empty self-entered name
must either match the selected legal register name or receive a separately
confirmed and audited owner identity review. Position publication supports an
optional target subcontractor. Worker discovery, enrollment checks, direct
enrollment and placement preflight all enforce the same current verified link;
the office can add that link after account admission. Open positions remain
available to all otherwise eligible applicants.

Verification: focused work-board domain and authenticated API tests passed
(38/38); office UI tests passed (21/21); targeted ESLint and the production
build passed. The build retains its existing 602.98 kB main-chunk warning.
This is position-level recruitment isolation, not comprehensive subcontractor
company isolation across jobs, evidence, conversations, notifications or offline
work packs. Hosted PostgreSQL parity and independent field acceptance remain
unverified. No commit, push or deployment was performed.

## 2026-09-27 - Cross-job equipment-outage recovery

When reserved equipment is unavailable, the recovery source now includes active
reservations for the same tool across all jobs. Counts are exact; at most 500
reservations are retained and the interface explicitly flags a truncated list.
Potential replacement tools are limited to the same registered category and a
known, non-overlapping time window, with available status, passing current
inspection readiness, no open safety hold, and no pending retirement. Candidate
details remain advisory: the interface requires a human to verify technical fit,
accessories, actual condition, location and safety. It creates no reservation
or reassignment.

Verification: focused recovery/domain/API tests pass (45/45), recovery React
tests pass (15/15), targeted ESLint passes, and the production build succeeds
with the existing 602.98 kB main-chunk warning. All five existing operational
recovery browser workflows passed across the initial suite and a targeted rerun
after updating a stale offline-sync confirmation assertion. Hosted PostgreSQL
and independent field acceptance remain unverified. No commit, push or
deployment was performed.

## 2026-09-26 - Delivery finance attribution

Billing milestones may now be linked to only one active partial delivery. The
work-delivery service rejects a second active link, the office editor disables
conflicting choices while preserving a path to remove legacy duplicate links,
and legacy conflicts suppress delivery-level invoice balances until corrected.
For a valid link, the delivery view shows the milestone's tax-inclusive total
and the linked invoice's actual reconciled received/outstanding balance. Those
details are not summed into job receivables a second time. No invoice, payment,
credit note or accounting entry is created or changed by the link.

Verification: focused Node delivery, API and readiness tests pass (10/10),
focused delivery/closeout UI tests pass (7/7), ESLint passes, and the
production-bundle browser workflows pass (2/2). The build retains the existing
602.96 kB main-chunk warning. PostgreSQL parity could not be run because no
PostgreSQL test URL is configured; production finance/accounting acceptance is
also unverified. No commit, push or deployment was performed.

## 2026-09-27 - Field-reported equipment safety quarantine

Workers can attach an equipment-fault report to a blocked task only when the
matching reservation is in their own checked-out custody. Online reports and
browser/native encrypted offline queues use the same server validation. The
report moves the tool to maintenance and creates a source-linked recovery case;
physical return does not release the hold. A passing inspection or completed
maintenance record is required, and routine equipment editing cannot bypass
that gate.

Verification: authenticated work-pack API integration (1/1), React field pack
tests (22/22), offline UI (4/4), targeted offline/native tests (3/3), four
related Node suites (52/52), ESLint and production build pass. The build retains
the existing 602.98 kB chunk warning. Native APK
compilation is unverified because Java/JDK is not installed in this
environment. Hosted PostgreSQL and independent field-device/site acceptance
remain unverified. No commit, push or deployment was performed.

## 2026-09-27 - Enforce company scope across mixed project assignments

Field project-detail reads now perform their own job authorization check. A
named worker can project only active assignments whose subcontractor
requirement still matches that worker's active owner-verified membership.
Position-linked task scope now stays restrictive if another active position
has separately linked tasks, even when the reader also has an unscoped
assignment in the same project. This also bounds task-linked drawing,
material and safety projections. Legacy field role tokens without a named
worker identity cannot read projects containing active company-targeted work,
even when the project ID appears on the token allowlist.

Verification: focused field work-pack, work-board, and company-scope tests
pass (61/61); the authenticated legacy-role API regression passes (1/1); and
targeted ESLint passes. Non-task-linked evidence and the remaining company
data surfaces still need review. Hosted PostgreSQL parity and independent
field acceptance remain unverified. No commit, push or deployment.

## 2026-09-27 - Limit field evidence to scoped document routes

Field workers can no longer use the generic document-content route for
arbitrary project files. Drawing revisions remain available only when current,
approved and visible in the worker's present assignment scope, with membership,
storage identity and checksum revalidated after the file read. SDS and approved
submittal files use their existing work-pack routes bound to the current source
hash. Raw field job-detail document metadata is reduced to visible drawings and
current SDS files linked to visible materials.

Verification: field work-pack, SDS revision, drawing revision, asset-history
and inspection-coverage API test files pass (5/5); targeted ESLint passes.
The same run corrected two stale migration-version expectations to the actual
latest migration, `095_field_reply_notifications`. Full evidence-access
inventory, hosted PostgreSQL parity and independent field acceptance remain
unverified. No commit, push or deployment.

## Phase 191: Verified Missed-Check-In Recovery Handoff

The office workbench now gives an owner or office operator a guarded action on a
missing check-in signal. It requires the operator to confirm that they contacted
the worker or verified the situation with the site lead. The server re-derives
the current source-bound signal before writing an unavailable period for only
the retained shift. A recorded check-in, changed huddle/assignment, or mismatched
hash rejects the request. Exact retries return the existing period. A
cancelled record can be restored only if the same current review source is still
valid and the operator reconfirms.

This closes the internal handoff from warning to confirmed unavailability; it
does not assert illness, inform the worker, replace the assignment, or contact
the customer. The existing availability-conflict view and the position's
explicitly enabled standby fallback handle the next steps. Human acceptance and
independent replacement approval remain unchanged.

The integrated regression covers the complete local chain: a valid start huddle
produces a check-in review, office confirmation records source-bound exact-shift
unavailability, and the next opted-in durable sweep creates one privacy-safe
standby offer. The worker still has to accept and a different approver must
approve the replacement. A repeated sweep does not duplicate the offer.

For this already-started-shift recovery only, call-outs require a zero-hour
minimum notice, at least 15 minutes remaining for response, and expire within
30 minutes or before the shift ends. Normal future-shift minimum-notice checks
remain unchanged. Once the worker accepts before expiry, the pending independent
approval can proceed after the response window closes, provided all live
assignment, availability, qualification and company checks still pass.

Verification: the focused domain scenario passes (1/1) and the daily-cycle API
suite passes (1/1), including owner/office authorization, worker denial and
stale-source rejection. The workbench component suite passes (8/8), including
confirmation and source-hash request wiring. Targeted ESLint and the production
build pass (the existing main-bundle size warning remains). The isolated
production-browser flow verifies the warning and the confirmed-unavailability
handoff end to end. Hosted PostgreSQL parity and independent field acceptance
remain unverified.

## Field collection privacy pass

Field-readable project collections now use the same active-assignment and task
projection as the work pack. This covers safety, planning, permit, quality,
attendance, equipment, material, daily-cycle, daywork, expense, environmental
and nonconformance reads. Material purchase-order plans retain only requirements
visible to the worker and recompute summary counts from those retained lines.
Nonconformance reads additionally exclude another worker's reports; this was
reproduced with a peer-task API fixture and regression-tested.

The field work-pack and attendance API suites pass. At the time of that pass,
broader tests still included stale migration-093 expectations, and the daily-cycle
fixture used a `scheduled` assignment. Phase 172 corrected the daily-cycle fixture
and migration assertion; the broader access inventory and hosted database parity
remain open. No commit, push or deployment.

## Field write authorization pass

Task state changes, standard material receipts and shared-stock arrival capture
are now bounded to the worker's current verified assignment and task/material
projection. Shared-stock arrival responses contain only that operator's receipt
plus aggregate issue quantities required by the field client; peer receipt
references and evidence are not returned. Replayed receipts are returned only
when their retained actor matches the authenticated operator.

Focused field-work-pack, shared-stock and material-receiving API tests pass, as
do targeted lint, syntax, diff, local readiness and dashboard HTTP checks. The
full evidence-access audit, hosted PostgreSQL parity, native-device checks and
independent field acceptance remain unverified. No commit, push or deployment.

## Field evidence task-scope pass

Task references are now checked against the current field work pack across the
remaining field evidence write routes, including progress, logs, incidents,
observations, NCRs and environmental reports. A governed photo upload must name
a photo workflow visible in the same work pack. Field-originated report names
are taken from authenticated worker identity, and upload-created ledger actions
retain the real operator as the audit actor.

Focused API suites, targeted lint, syntax and diff checks pass. This closes only
the task-reference and attribution slice of field-write authorization; the full
route/payload inventory, hosted database parity and independent field acceptance
remain open. No commit, push or deployment.

## Assignment-bound field signoff

Field daily-cycle lists now include only records whose retained crew contains
the authenticated worker, and end-of-day submission is restricted to the
cycle's retained lead. Safety briefings must appear in that worker's assigned
briefing projection before an acknowledgement can be retained.

Peer-cycle visibility/closure and peer-briefing acknowledgement regressions
pass with the focused daily-cycle and field-work-pack API suites. PostgreSQL
parity, the complete route inventory and independent field acceptance remain
unverified. No commit, push or deployment.

## Inspection and equipment ownership

Field checklist submissions now require the authenticated worker identity and
an inspection in the worker's current assignment projection. Installation-QC
submission remains tied to the assigned worker; explicitly job-scoped legacy
read tokens retain only their declared QC job view. Equipment checkout is
limited to reservations in the worker's field pack, and only the worker holding
a retained custody session can return it. The QC collection projection now
handles controls whose public identity is inspectionId rather than id.

Peer-inspection submission, peer-equipment return, installation-QC, and field
work-pack API regressions pass in the focused suites. The repository-wide
authorization inventory, hosted PostgreSQL parity, and independent field
acceptance remain unverified. No commit, push or deployment.

## Released work photos in customer conversations

The office may prepare a customer update with an explicitly selected work
photo only when it is still part of the same job's intact, approved and
released evidence set. The existing private document is linked rather than
copied. The photo's source and checksum are revalidated at draft, communication
approval and publication; the customer cannot see either until publication,
and the customer projection does not expose internal provenance. Messaging via
WhatsApp or email remains a separate integration and action.

## Phase 189: Joint Portfolio Resource Planning

The contractor schedule now lets an operator select two to eight active jobs
and calculate a single crew plan across up to 48 schedulable tasks. The Z3
solver treats the selected jobs as one assignment problem: existing task times
and approved crew composition stay fixed; active assignments outside the
selection, qualification, availability, capacity calendars, dependencies,
material holds and supervisor reservations remain constraints. Between
selected sites, shared workers receive a directional travel buffer only from
matching current site snapshots and a retained sourced route. Missing addresses,
routes or stale route snapshots block a feasible result rather than assuming a
zero-minute trip.

The preview appears in the portfolio schedule with task, job, worker, role,
supervisor, time and travel assumptions. One source-hashed approval covers all
selected jobs. Resolution re-prepares every source and validates the complete
allocation before any task row changes; task updates and audit entries execute
inside the approval transaction. A changed source leaves the approval pending
and does not partially apply the other jobs. The browser checks the responsive
schedule flow and submits the approval; it does not resolve it automatically.

| Verification | Result |
| --- | --- |
| Resource planner | 19/19 focused Node tests passed, including shared-worker travel spacing, idempotent approval, independent approval, stale-source rejection and all-or-nothing application. |
| Browser | Joint planning selection, preview, route display, mobile overflow check and approval submission passed (1/1) using the production bundle. |
| Lint and build | Targeted ESLint passed; the production build passed. Vite still reports an existing large main-app chunk warning. |
| Remaining boundary | The planner is bounded at eight jobs and 48 active tasks per preview. Dispatch beyond selected ledger jobs, live traffic/maps, external worker offers, hosted PostgreSQL parity and independent field acceptance remain unverified. No commit, push or deployment. |

## Phase 190: Sequential Standby Call-Out Fallback

An owner can explicitly enable bounded standby call-outs on a released position.
When an offered worker declines, or the response deadline passes, a later durable
planner cycle may offer the next currently eligible worker whose standby window
covers the shift. Previously contacted workers are skipped. Only one call-out is
open at a time and no more than three distinct workers are contacted for the same
assignment and unavailability event. The planner also expires overdue offers
without requiring the worker to open the portal, records an audit event, and
adds a privacy-safe notice to that worker's inbox. If the limit is exhausted or
the event enters another non-retry state, it returns to owner review.

This is not automatic placement: each worker must accept, the owner must submit
the replacement proposal, and an independent approver must approve it. The
original assignment is not modified by offer, decline or expiry. The feature
does not use email, WhatsApp, push notifications or external commitments.

Verification: the focused work-board and standby-callout API tests pass (12/12),
targeted ESLint passes, and the production build passes. The build retains the
existing warning for the 604.13 kB main application chunk. PostgreSQL parity,
durable-scheduler deployment behavior and independent field acceptance remain
unverified. No commit, push or deployment.

## Phase 192 - Briefing continuity for replacement workers

The retained daily huddle now records exact crew assignment windows in its
integrity-bound snapshot while keeping those private windows out of the shared
crew listing. Each field work pack projects only the matching worker and
assignment briefing. The latest released huddle overlapping a replacement's
scheduled shift must include that assignment; a later crew change cannot be
bypassed by the older briefing. Otherwise start-release eligibility blocks
until the site lead records an updated huddle. A changed assignment window or
invalid huddle requires review. When no huddle exists, the pack shows it as
missing and start-release eligibility remains blocked until the site lead
records the shift briefing. Adjacent local work dates are searched for shifts
that cross UTC midnight. A huddle is not itself permission to start.

The mobile web, encrypted offline and native Android views use the same saved
work-pack revision. The native app shows only the assigned briefing fields and
the stale-crew warning. No peer names, peer schedules or other briefing notes
are projected. Offline snapshots remain unable to detect later server changes.

Verification: focused domain, API, daily-cycle and offline/native source tests
pass (45/45); the field work-pack frontend suite passes (26/26); the production
browser work-pack flow passes (1/1); targeted ESLint and the production build
pass. The build retains the existing large main-app chunk warning. Android
remains uncompiled/device-unverified; hosted PostgreSQL parity and independent
field acceptance remain open. No commit, push or deployment.

## 2026-09-27 - Atomic task handoff after approved worker replacement

Individual and multi-job replacement approvals now hand explicit open-task
assignees, crew members and supervisors to the replacement atomically with the
assignment change. The approval transaction validates task schedule coverage,
trade and current qualification, rejects duplicate crew membership, and rolls
back without resolving the approval when a partially scheduled or out-of-window
task cannot be safely handed over. Unscheduled assigned tasks move with an
explicit schedule-review marker and cannot receive capacity allocations until
they have a complete schedule. Active planned hours from today onward on the
released assignment are cancelled with audit history so the replacement must
be replanned; earlier allocations remain intact. No recorded work is rewritten.

Eight focused Node suites pass (132/132) across recovery, availability,
worker-board, standby, crew capacity, planning and field work packs. Targeted
ESLint and the production build pass; the existing 604.18 kB main-chunk warning
remains. `git diff --check` passes. Hosted PostgreSQL parity and independent
field acceptance remain open. No commit, push or deployment.

## 2026-09-27 - Replacement task schedule review resolution

Unscheduled tasks handed to a replacement now display a schedule-review warning
in the office work plan and link directly to resource planning. The review
marker resolves only after the complete proposed window has been validated
against an active, approved replacement assignment, matching role and current
qualifications, and availability. Invalid or incomplete coverage remains
unresolved. Individual and portfolio approvals also clear the stale
`requiresApproval` state from the activated replacement assignment; the
schedule review itself remains a separate required step.

Focused domain, planner and integration tests pass (105/105), and the production
browser work-plan flow passes (1/1). Targeted ESLint passes and the production
build succeeds with the existing 604.18 kB main-chunk warning. Hosted
PostgreSQL parity and independent field acceptance remain open. No commit, push
or deployment.

## 2026-09-27 - Skill-aware opportunity capacity signals

Opportunity trade forecasts now retain up to twenty required skill labels per
role. Bid review compares their normalized exact names with workers' declared
skills and reports matching profiled workers and remaining hours by requested
workday, separately from general role capacity and approved-certificate
readiness. Missing declarations leave the assessment incomplete. Matches are
explicitly unverified self-reports; they neither establish competence nor
assign workers, waive credential requirements, or reserve capacity. The office
can edit these labels on a retained opportunity, and conversion continues to
create only the existing qualification requirements from approved catalogue
keys.

Focused acquisition/bid tests pass (16/16), locale tests pass (5/5), and the
production-browser opportunity pipeline passes (1/1). Targeted ESLint passes;
the production build succeeds with a 604.89 kB main chunk against the 600 kB
warning threshold. Hosted PostgreSQL parity and independent operator acceptance
remain open. A separate local configuration finding is recorded in
`docs/TECHNICAL_AUDIT.md`: the active Vite origin at port 34123 is not in the
API's default exact origin allowlist, so browser-originated local mutations are
rejected until that exact origin is configured. No data was changed during the
direct UI check. No commit, push or deployment.

Full-suite follow-up: the first 955-test run reported one mixed-trade planner
failure. That test passed in isolation and during the second full run (908 pass,
47 PostgreSQL-dependent skips, zero failures); the transient failure was not
reproduced and no assertion was weakened.

## 2026-09-27 - Supervision staffing carried from pursuit into work planning

Preconstruction capacity forecasts can now record an explicit supervisor role,
maximum crew ratio, peak headcount and supervisor shift hours per workday, plus
the required catalogue qualifications. The assessment computes how many
supervisors and role-hours are needed each day and checks those separately from
production trades against profile hours, existing assignments, availability and
specified credential evidence. Same-role productive and supervisory demand is
rejected to avoid counting one role as both.

Conversion copies the normalized forecast into the job with a source hash and
planning-only status, and creates the supervisor qualification requirements.
The job work plan exposes that inherited estimate. It remains an estimate: no
tasks or workers are created, and the system does not verify statutory ratios,
overlapping supervision windows, or worker assignments.

Focused Node tests pass (18/18), supervision-review and Dutch-locale frontend
tests pass (7/7), the production-browser path from opportunity intake through job
conversion and visible work-plan forecast passes (1/1), and repository lint
passes. The browser runner's production build succeeds with a 610.12 kB App
chunk against the 600 kB warning threshold. The full Node suite passes (910
passed, 47 PostgreSQL-dependent tests skipped, zero failures); hosted
PostgreSQL parity remains unverified. No commit, push or deployment.

## 2026-09-27 - Forecast-to-resource reconciliation

The resource-plan preview now compares opportunity forecast hours with planned
hours by trade and surfaces missing/extra roles and task-level supervision gaps.
Forecast edits invalidate old proposals. Internal coordination checklist items
no longer block field resource previews, while operational tasks still require
explicit trade scope. The comparison is advisory and does not verify the
accepted contract scope or align dated forecast periods to task schedule windows.

Fixed an intermittent mixed-trade approval defect: the primary assignee could
be checked under the task's primary trade even when that worker's explicit crew
role was another trade. The approval review now respects the crew-role records.
Validation passed: 62 focused Node tests, eight consecutive runs of the formerly
flaky test, six locale tests, one production-browser pipeline test, and full
repository lint. The production build succeeds with the existing 610.12 kB
App-chunk warning. Hosted PostgreSQL parity and live operator/field acceptance
remain open. The final full Node run for this increment passed 911 of 958
tests, with 47 PostgreSQL-dependent skips and no failures. No commit, push or
deployment was performed. September 30 runtime inspection found that port 3001
belongs to another application; the canonical dashboard is now served on 3002,
as recorded in the technical audit.

## 2026-09-30 - Dated resource review and deployable solver

The resource preview now compares planned crew and supervisor hours against
the retained estimate by local workday, not just aggregate totals. It preserves
unknown dated estimates, missing task windows and undated hours, exposes work
outside the forecast window, and splits overnight work at actual local midnight
including DST. The recorded site timezone is used when available; the fallback
to Europe/Amsterdam is explicitly labeled. Shared supervision stays unknown
when any contributing forecast lacks a dated distribution. Named supervision
is counted even without a ratio. No accepted scope or staffing commitment is
changed automatically.

The responsive dashboard presents these differences in an expandable review.
The opportunity-to-job-to-preview browser flow passes at 1440x1000 and 390x844,
with no horizontal report/page overflow or page exceptions. Desktop and mobile
screenshots were inspected; the phone warning remains reachable by scrolling.
Screenshots: the system temporary directory's
`contractor-ai-date-review-desktop.png`, `contractor-ai-date-review-mobile.png`
and `contractor-ai-date-review-mobile-warning.png`.

Fourteen missing runtime files are now included in both delivery manifests.
The release gate checks literal import/worker dependency closure without
executing source. The actual rebuilt Node 22 Docker image passes authentication,
read-only/non-root operation, SQLite/session persistence on restart, registry
recovery, handover and a real solver-backed dated resource preview that leaves
the fixture ledger unchanged. The Windows source manifest passes, but no new
Windows binary has been built. The isolated fixtures do not modify operator data.

Current increment validation: 37 focused Node tests, 6 additional authentication
and authorization tests, 8 frontend tests, one
production-browser workflow, repository lint and release contract pass.
The narrow brace-expansion lockfile update leaves zero known local dependency
audit findings. Build succeeds; the 610.13 kB App chunk warning remains.
The Phase 197 full-suite result above is historical, not a Phase 198 full run.
PostgreSQL parity and independent office/field acceptance remain unverified.

The built local dashboard is running at `http://127.0.0.1:3002` on Node 22.23.2
with ready configuration/database and verified evidence storage. The separate
Vite launch was rejected by execution policy; no other application's process
was stopped. No commit, push, provider activation or hosted deployment occurred.

Final release check: `verify:bundle` fails. Largest JS is 610,125 bytes against
600,000, total gzip 674,681 against 578,500, total Brotli 583,409 against
540,000; five individual surface budgets also fail. The successful build and
source release contract do not establish release readiness. Payload reduction
remains required; no budget was relaxed to hide this failure.

## 2026-09-30 - Finance on demand and retained Dutch statuses

The finance workspace no longer travels inside the initial App module. It is
loaded through a local Suspense boundary when Finance is opened; its nested
cash-flow review remains lazy. The parent's canonical request function is
passed explicitly, and original pricing, approval, download, evidence and
callback behavior is retained. Financial action labels live in one shared
module rather than a duplicate copy. Production-browser request observation
proves no finance-module request before navigation and one after navigation.

This fixes the largest-JS release limit: App is now 591,140 bytes instead of
610,125 (limit 600,000). It does not fix the aggregate gate. Total gzip is
676,627/578,500 and total Brotli 585,512/540,000 bytes, and five individual
surface budgets still fail. Separating modules slightly increases aggregate
compression overhead; claiming the entire download is smaller would be false.

The production translation compactor now preserves known API status labels
derived by replacing underscores with spaces, including identifier object keys.
The cost-review status stays Dutch in the real built browser flow. Source text,
cost-line descriptions and receipt references remain untouched. Test scenarios
explicitly select their operator locale so prior persisted preferences cannot
invalidate a subsequent scenario.

Verification so far: 52 focused Node/source/caching tests, four production
browser flows, repository lint, source release contract and actual rebuilt
Node 22 Docker runtime pass. Browser flows cover desktop 1440x1000, tablet
768x1024 and mobile 390x844, finance forecast retention, cost-evidence
preservation, accessibility, navigation/dossier drafts and opportunity/resource
planning. Desktop and mobile finance screenshots were inspected in
`test-results/finance-localization-job-c-89182-rewriting-retained-evidence-operator-workflows/`.
The Docker smoke verifies startup, authenticated session/database persistence,
identity backup/recovery, handover and the real solver preview.

Vitest parallelism is limited to two workers without extending test deadlines;
the final full component rerun passes 259/259 across 53 files. Earlier
unbounded-worker runs had a stale selector failure and, during a concurrent
Docker build, 17 failures dominated by test deadlines and cascading assertions.
No assertions or deadlines were weakened. The
local server on loopback port 3002 remains ready and serves the rebuilt UI.
Windows artifact refresh, full Node regression for this increment, hosted
PostgreSQL parity, native-device and independent field acceptance remain open.
No commit, push, provider action or hosted deployment occurred.

## 2026-09-30 - PostgreSQL acceptance and production-readiness scope

Phase 200 verifies the current covered ledger contracts against a disposable
PostgreSQL 17.11 server with authenticated TLS, using Node 22.23.2. The local
group passes 896/896 and the final database group passes 79/79, with no skips.
The first database run failed one stale migration-092 expectation; four
concurrent starts correctly reached migration 095. That test now also checks
the newest tables, indexes and field-reply constraint, and the entire database
group was rerun successfully. These are two final green groups totaling 975
tests, not a claim that the first combined command passed.

Database tests now refuse unsafe targets before connecting, including direct
test invocation. The guard accepts only loopback and explicitly test-named
databases; CI retains verified TLS under its renamed disposable database.
The added resource-planning contract exercises a mixed-role replacement crew,
dated variance, source-change rejection without partial allocation, separate
approval, persistence after restart and unavailable crew without silent
replacement. Existing pending-review and audit boundaries remain intact.

Migration/backup verification, transfer, identity, replicas, audit, shared work
and partial-delivery contracts now have local PostgreSQL evidence. This is not
proof for every domain scenario or a live EU deployment: object storage was a
test double and provider recovery, production ingress, DPA/residency evidence
and independent acceptance remain unverified. The test database container was
removed; execution policy refused cleanup of its temporary TLS fixture files.
No operator administration, provider, commit, push or deployment was changed.

The user updated the active objective to production readiness. Remaining
bundle-budget failures, Windows artifact refresh and live/operator acceptance
must be addressed without relaxing safety gates or representing local tests
as production proof.
