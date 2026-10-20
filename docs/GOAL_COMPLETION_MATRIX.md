# Goal Completion Matrix

Status meanings:

- **Implemented**: present in code/docs and covered by a release gate.
- **Partial**: useful capability exists, but the full phase scope or production
  evidence is not complete.
- **Blocked**: requires operator infrastructure, credentials, contracts, or legal
  decisions not present in the repository.
- **N/A**: phase is a reporting instruction rather than product behavior.

No phase is marked complete solely because a document exists. Final automated and
manual evidence is recorded in `FINAL_VERIFICATION_REPORT.md`.

| Phase | Requirement | Status | Repository evidence / remaining gap |
| ---: | --- | --- | --- |
| 000 | Repository integrity and true starting point | Implemented | Clean `main` starting SHA retained in audit/worklog; retired paths guarded by release contract |
| 001 | Complete file and dependency audit | Implemented | Source inventory, dependency audit, release scan; runtime/generated paths excluded |
| 002 | Product definition and user outcome contract | Implemented | README and critical path define the local-first contractor operating outcome |
| 003 | Critical path definition and smoke test | Implemented | `CRITICAL_PATH.md`, workflow integration/browser tests |
| 004 | Architecture decision and current stack validation | Implemented | One Node/Express + React ledger runtime; SQLite local/PostgreSQL hosted decision |
| 005 | Data model, ownership, and persistence design | Implemented | Versioned migrations through `097_durable_evidence_storage_reservations`, resource ownership, SQLite/PostgreSQL contracts, and transactional evidence quota reservations |
| 006 | Configuration validation and startup guards | Implemented | local/hosted startup readiness tests and fail-closed environment validation |
| 007 | Authentication model and session security | Implemented | signed operator cookies plus durable hash-only worker sessions, independent role keys, login limits, auth tests |
| 008 | Authorization and resource ownership | Implemented | role middleware, job/assignment/portal scoping, owner-only debug/operations |
| 009 | API contract and error envelope | Implemented | ledger routes, stable errors/statuses, replay semantics, API audit |
| 010 | Frontend architecture and navigation model | Implemented | one Vite/React application plus scoped client portal |
| 011 | Core workflow vertical slice | Implemented | opportunity through project, evidence, commercial, handover and finance workflows |
| 012 | External provider reality review | Partial | provider receipts fail closed; real email/accounting/maps/calendar/AI need credentials |
| 013 | Compliance and platform policy boundaries | Partial | explicit non-certification controls; jurisdiction/project legal review remains external |
| 014 | No fake success and no mock production behavior | Implemented | delivery/acceptance/payment/certification states require separate evidence |
| 015 | Storage, files, uploads, and media safety | Implemented | private adapters, signature/checksum/path/ownership controls and actual bounded JPEG/PNG/WebP decoding; separate small authorized previews preserve original evidence; service/browser queues and caches are limited; Phase 229 admits at most eight conversation-preview leases per document with offscreen release, fresh authorized reentry and manual fallback; tamper, access, animation-first-frame and original-download tests; not a whole-browser RAM guarantee |
| 016 | Background jobs, schedulers, and workers | Implemented | durable opt-in scheduler, database leases, ledger-only cycle |
| 017 | Idempotency and duplicate action prevention | Implemented | exact replay keys, source identities, hashes and atomic constraints |
| 018 | Rate limits, cooldowns, and provider quotas | Implemented | durable bounded API/login limits; provider action remains disabled until verified |
| 019 | Audit logging and event history | Implemented | transaction-bound SHA-256 chain, direct trusted-principal use across all explicit mutation routes and authoritative operational provenance, source guards against body-derived actors and submitted-first `...By` principals, source-hashed NCR verifier principal, history UI, integrity/readiness checks |
| 020 | User-facing dashboard and next-action design | Implemented | Today exception/command queue, approvals, safety and readiness indicators |
| 021 | Forms, validation, and autosave behavior | Partial | validation/submission states, field offline queue, and bounded operator/client/worker draft recovery cover central workflows, crew capacity profiles, per-job work-balance allocation, interruption-resilient operational-recovery, supplier, linked warehouse issue, replacement, client-impact, contract-impact, worker availability, approval-gated early-return requests, and drawing revision metadata; drawing PDFs remain server-retained and are not copied to browser session storage; warehouse issues atomically reserve/issue exact-unit stock, remain unavailable until site receipt, and require reassessment after their source changes; the company-wide recovery portfolio adds derived, explainable priority and next-review guidance from current impacts without changing commitments; exact idempotent recovery commands survive reload and source-bound drafts are separated; other component-internal forms are not universally recoverable |
| 022 | Search, filters, sorting, and pagination | Partial | client, crew, qualification worker, availability, equipment and trade-partner registers share accessible paging; material receipts add reference/project/receiver/item/exception search, sorting and pagination. Phase 241 caches the exact former qualification/availability JSON searches during active mounted search and bounds qualification workers to 25 initial rows. Default worker loading cap 500 and unpaged job requirements remain; availability conflict truncation reports completeness and fails closed for cross-job replacement; other lists remain inconsistent |
| 023 | Import and export workflows | Implemented | operational export/validation, backup download, hosted migration and CSV packages |
| 024 | Templates, presets, and reusable user defaults | Partial | all 23 framework families have guarded method playbooks and cadence/measure starters; checklist templates and rate policies exist; user presets are not universal |
| 025 | AI/provider abstraction and deterministic fallback | Partial | local Ollama conversation adapter passed a live synthetic `qwen3:4b` analysis through its durable queue and a temporary SQLite ledger; current question/request/issue/contradiction findings can be assigned to source-bound internal RFIs, and an approved RFI response can return as an unpublished, source-linked customer-conversation draft; variations and client choices remain separate approval-gated actions; process-local settings were restored, no automatic-analysis setting was changed, and no general remote AI adapter or production-message acceptance is claimed |
| 026 | Human review queue and approval gates | Implemented | approval queue, atomic source-current decisions, rejection recovery |
| 027 | Notifications and reminders | Partial | durable, worker-scoped in-app inbox retains standby call-outs, position offers and placements across refresh/restart; online polling refreshes open work boards and an encrypted offline work-pack snapshot is refreshed only during explicit online sync; external/background push still requires verified channel configuration and device acceptance |
| 028 | Privacy controls and data deletion | Partial | applicants can submit and track self-scoped requests before and after admission; source-current approval, correction, export, restrictions and partial pseudonymisation are retained; identity-registry coverage, counsel-reviewed retention and full legal erasure remain open |
| 029 | Security headers and web security | Implemented | CSP/headers, CORS/origin, body limits, proxy validation and tests |
| 030 | Secrets management and credential rotation | Implemented | no fallback secrets, env validation, role-key rotation/revocation guidance |
| 031 | Local development one-command experience | Implemented | `npm ci`, build/start plus split API/Vite development commands and isolated browser runner |
| 032 | Docker and deployment readiness | Partial | PR #120 exact-head CI run `38623187739` passed production build, container acceptance, bundle gate, Windows standalone packaging and full verify; post-merge CodeQL is clean. No provider-provisioned Hetzner/EU deployment, production ingress, managed database/object store or restore acceptance is recorded |
| 033 | Database migrations and rollback safety | Implemented | append-only migrations, locks, backup/restore and environment migration validation |
| 034 | CLI and doctor/self-diagnostic command | Implemented | privacy-minimized `npm run doctor` |
| 035 | Observability, health, and readiness endpoints | Implemented | minimal public health plus authenticated detailed readiness/capabilities |
| 036 | Admin/operator diagnostics | Implemented | integrity, migrations, backups, exports, control and support bundle |
| 037 | Demo mode with explicit labelling | Implemented | QA/demo records are labelled; owner maintenance previews the complete set, rejects stale plans, verifies recovery, and archives atomically |
| 038 | Fake provider lab for tests only | Implemented | test doubles remain under tests; production requires verified allowlisted provider |
| 039 | Test-data factories and fixtures | Implemented | isolated temp data, per-test server/ledger fixtures, QA records; canonical Node children allowlist inherited platform settings, discard operator/provider paths and secrets, use unique default storage despite reused process IDs, preserve native worker fixture storage and retain only guarded test PostgreSQL configuration with verified TLS; not a security sandbox |
| 040 | Backend test suite | Partial | PR #120 exact-head GitHub run `38623187739` passed the Node test groups (1,111 and 128 tests; zero failures or skips in both groups), including the configured CI database test group. Managed-provider parity, production data and hosted acceptance remain external |
| 041 | Frontend and component test suite | Implemented | Phase 243 fresh full suite 528/528 over 85 files, two workers, 159.00 seconds, terminal exit 0. Existing bounded qualification/client paging, exact search/index/row reuse, fallback/fresh records, callbacks/rights/locale/busy states, cancellation, private media, drafts and exact retry controls pass. React/style sources are unchanged; current build behavior is separately checked by Node/compiler and selected browser tests |
| 042 | Worker/job test suite | Implemented | scheduler lease, idempotency, failure and suspension tests |
| 043 | End-to-end workflow tests | Partial | PR #120 exact-head run `38623187739` executed all 46 Playwright batches with no failed batches. Independent device, cross-browser, live-provider and operator acceptance remain open |
| 044 | Acceptance test matrix | Implemented | `ACCEPTANCE_TESTS.md` maps 56 release outcomes |
| 045 | Adversarial break-the-app tests | Implemented | source drift, replay, auth, rate, tamper, malformed evidence and conflict tests |
| 046 | Cross-user isolation tests | Implemented | roles, assignment/resource ownership and portal token boundaries |
| 047 | File safety and path traversal tests | Implemented | evidence, backup, package, upload, symlink/path/checksum cases |
| 048 | Provider failure simulation | Implemented | unavailable/unverified/ambiguous provider states fail closed in tests |
| 049 | Accessibility review | Partial | pinned axe gate reports zero selected WCAG A/AA violations across sign-in, all primary workspaces, representative dialogs, mobile navigation, and the mobile/desktop client portal; independent assistive-technology and user audit remains external |
| 050 | Responsive and browser compatibility | Partial | Phase 244 selected 15 Chromium cases pass. Current 1280x720/390x844 dashboard captures inspected without overlap; relevant console, scoped axe and containment checks pass. Previous frontend build/CSS reused unchanged, not rebuilt. Independent devices/cross-browser/assistive technology and full current browser acceptance remain open |
| 051 | Performance baseline and indexing | Partial | PR #120's exact-head bundle gate passed across 117 assets: 700,044 gzip / 598,959 Brotli bytes; largest JS is 370,044 bytes, with no budget failures. Synthetic ledger measurements do not establish hosted-load, whole-device RAM or independent device performance; production-like hosted load and operator/device acceptance remain open |
| 052 | Large dataset and pagination testing | Implemented | 5,000 jobs, 20,000 tasks, 2,500 opportunities, 5,000 approvals and 25,000 chained audit events verify bounded lists, historical search and untruncated aggregates |
| 053 | Backup and restore procedures | Implemented | signed v3 DB/evidence manifests, atomic publication, authenticated checksums, validation, rollback, session revocation, runbook |
| 054 | Data reconciliation and repair commands | Partial | integrity/reconciliation/restore/migration tools exist; no generic mutation repair CLI |
| 055 | Product analytics local-first design | Implemented | retained contractor scorecard and operating metrics; no forced external telemetry |
| 056 | SaaS readiness without forced billing | Implemented | portable hosted contract with local-first mode; billing is not required |
| 057 | Internationalization and Dutch/English readiness | Partial | persisted per-operator NL/EN preference, locale-aware formatting, complete token-scoped client portal, and bilingual owner business identity/onboarding, managed team access, autonomous safety control, QA archive maintenance, Performance Scorecard, Framework Register, market-fit, bid/no-bid, site-survey, WBS/quantity takeoff, labour burden/overhead/unit-rate estimating, commercial scope/allowances, project risk/premortem, fixed-price-versus-regie decisions, estimates/quotes/acceptance, formal variations, bid-package comparison, preferred-bidder selection, purchasing commitments, immutable purchase-order packages, verified provider receipts, workforce directory, qualification evidence, availability, governed work permits, equipment registration/inspection/maintenance/custody/quarantine/retirement, job setup coverage, critical-path work planning, project controls for RFIs/submittals/revisions/transmittals/meetings, daily start/EOD controls, production baselines/output/reversals, regiewerk tickets/acknowledgement/conversion, crew-capacity/two-week planning, Last Planner, 5S, LMRA, installation/QC inspections, photo evidence, NCRs, field observations/incidents, field assurance review, punch/warranty/aftercare/feedback closeout, client-success handover, job costing, cost-code review, cost-to-complete, source-linked finance forecasts, and 13-week cash-flow controls; remaining specialist workspaces still contain English-only copy |
| 058 | Feature flags and rollout controls | Partial | provider/scheduler/storage controls and owner stop; no generic flag service |
| 059 | Formal state machines | Partial | guarded explicit statuses/transitions across domains; not one central state DSL |
| 060 | Domain model specification | Implemented | migrations, ledger methods, README safety model and API contracts |
| 061 | Data invariants and constraints | Implemented | database constraints plus transactional current-source/lifecycle checks |
| 062 | Pre-action safety review screen | Implemented | approval previews, source evidence, external-action separation and confirmation |
| 063 | Provider credential verification checklist | Implemented | readiness/capabilities, env examples and EU hosting runbook |
| 064 | Threat model and security design review | Implemented | `SECURITY.md` trust boundaries, controls and incident procedure |
| 065 | Privacy impact assessment | Partial | data classes/purpose/minimization/retention risks documented; counsel sign-off external |
| 066 | Supply chain and dependency review | Implemented | lockfile audit at zero known advisories and CI dependency gate |
| 067 | License and third-party service review | Partial | AGPL-3.0-only package license and provider boundaries; service terms need operator legal review |
| 068 | CI/CD quality gates | Implemented | lint, audit, release, test, build, axe accessibility, browser and container workflows |
| 069 | Release process, canary, and rollback | Blocked | local gate/runbook implemented; real EU canary/rollback needs selected infrastructure |
| 070 | Operator runbook | Implemented | `OPERATOR_RUNBOOK.md` and `EU_HOSTING.md` |
| 071 | User guide and help system | Partial | searchable Dutch/English in-app guidance now covers contractor, field-worker, and client basics with role-aware visibility and workspace links; not every specialist workflow has maintained help content yet |
| 072 | Troubleshooting guide and error catalog | Implemented | operator diagnostics table, doctor and stable error codes |
| 073 | UI action audit | Implemented | `UI_ACTION_AUDIT.md` maps actions and residual gaps |
| 074 | Backend endpoint usage audit | Implemented | `API_USAGE_AUDIT.md`, route/call-site counts and release assertions |
| 075 | Documentation truthfulness audit | Implemented | limitations, non-certification and pending verification are explicit |
| 076 | Technical debt register | Implemented | technical audit records module size, remaining specialist-workspace i18n, autosave and provider-bound load acceptance debt; owner business identity/onboarding, managed team access, autonomous safety, QA maintenance, workforce directory, qualifications, availability, governed permits, setup coverage, critical-path work planning, bid decision, tender comparison, purchasing, project controls, crew planning, quality, NCR, field risk, assurance, closeout, client-success, job-costing, cost-to-complete and cash-flow practical-core controls are now bilingual |
| 077 | Bug hunt log | Implemented | worklog records findings, tests and scope decisions |
| 078 | Red-team review loop one | Implemented | side-effect/provider/source-currentness boundaries rechecked |
| 079 | Red-team review loop two | Implemented | auth/privacy/debug/support boundaries rechecked |
| 080 | Red-team review loop three | Implemented | hosted durability/recovery/retention and operational stop rechecked |
| 081 | Non-technical user simulation | Partial | browser operator flows exist; final independent user acceptance still required |
| 082 | Autonomy-first product review | Implemented | ledger-only drafts, owner stop, approval and verified delivery boundaries |
| 083 | Value review | Implemented | critical path and practical contractor core prioritized over vanity surfaces |
| 084 | Product realism review | Implemented | no fake send/pay/certify states; external prerequisites remain visible |
| 085 | Requirements traceability | Implemented | this phase-by-phase matrix and acceptance mapping |
| 086 | Task graph and dependency map | Implemented | `TASK_GRAPH.md` |
| 087 | Codex worklog and checkpoints | Implemented | `CODEX_WORKLOG.md`, `CODEX_CHECKPOINTS.md` |
| 088 | Context-loss resume safety | Implemented | checkpoint resume procedure and durable repository artifacts |
| 089 | Progressive stabilization gates | Implemented | task graph gates G0-G6 and fail-closed release contract |
| 090 | No vanity work rule | Implemented | runtime/safety/diagnostic/hosted controls prioritized; no marketing page added |
| 091 | Feature-level definition of done | Implemented | acceptance requires persistence, role, replay, UI, test and truthful side-effect state |
| 092 | Fresh-clone dry run | Partial | package/build/container, Node 22 Windows packaging, and controlled ngrok-edge gates emulate clone; external hosted stack not available locally |
| 093 | Manual verification evidence | Partial | automated real-browser, local runtime, controlled public-edge, and Windows package evidence passed; independent operator/provider/hosted evidence remains external |
| 094 | Final no-excuses search | Implemented | release scan covers 67 canonical paths, 12 retired paths, 16 hosted keys and 340 canonical source files; dependency audit reports zero vulnerabilities |
| 095 | Completion matrix | Implemented | this file contains every phase 000-115 |
| 096 | Final verification report | Implemented | report records exact local command, browser, runtime, package and container results plus external boundaries |
| 097 | Final response requirements | N/A | final user response will list revision, tests, limitations, blockers and push state |
| 098 | Post-completion maintenance plan | Implemented | changelog discipline and runbook maintenance schedule |
| 099 | Roadmap and blocked items | Implemented | residual technical debt and external blockers are explicitly listed |
| 100 | Real-provider cleanup and account safety | Blocked | no credentials supplied; product fails closed and retains rotation checklist |
| 101 | Support/debug bundle design | Implemented | owner-only privacy-minimized v1 support bundle and doctor CLI |
| 102 | Data retention and archival policy | Partial | hosted policy reference required and archive/export exist; periods need counsel decision |
| 103 | Migration from prototype to production | Implemented | Python/mock runtimes retired; Node ledger sole runtime and historical 410s guarded |
| 104 | Operator safety stop and emergency controls | Implemented | audited durable suspend/resume with an accessible reason-and-acknowledgement dialog; explicitly not a physical emergency system |
| 105 | User onboarding and first-run wizard | Implemented | owner-only four-step identity, contact, billing and readiness flow persists each step to the canonical ledger and is mobile/browser tested |
| 106 | Role-based settings and team permissions | Implemented | owner-managed named accounts, field scope, one-time hashed keys, rotation/deactivation, session revocation, protected deployment principals, recovery invalidation and desktop/mobile tests |
| 107 | Quality scoring and confidence display | Partial | fit/scorecard/quality/confidence evidence exists but is not universal across predictions |
| 108 | Human decision minimization | Implemented | Today proposes grouped next actions while retaining approval for risky decisions |
| 109 | Exception-based workflow dashboard | Implemented | Today, readiness, approval, dispatch, evidence, finance and compliance exceptions |
| 110 | Safe retries and recovery strategy | Implemented | exact replay, leases, ambiguity gates, backup/restore and reconciliation |
| 111 | Ambiguous external action resolution | Implemented | delivery state requires allowlisted provider receipt; ambiguous attempts do not retry blindly |
| 112 | Versioning and changelog discipline | Implemented | 1.1.0 release and `CHANGELOG.md`; append-only migration numbering |
| 113 | Regression baseline | Implemented | release commands, critical path, acceptance matrix and broad test suite |
| 114 | Maintenance and refactoring review | Partial | debt documented; monolith extraction intentionally deferred behind contract tests |
| 115 | Final human-operator readiness test | Partial | 101 automated desktop/mobile workflows plus Windows HAI and controlled authenticated-ngrok lifecycles passed; independent human, live HAI/ngrok, EU and provider acceptance remain external |
| 116 | Evidence-bound client completion response | Implemented locally | Exact current delivered dossier, token-scoped download, idempotent customer response, office review list, stale-source warning, privacy inventory/redaction and operational export; does not represent signature or automatic acceptance. PostgreSQL/live legal workflows remain unverified. |
| 117 | Durable office review of client completion responses | Implemented locally | Append-only, idempotent disposition history with rationale, actor, time and source-current snapshot; stale-source acknowledgment, role checks, privacy redaction and export; no automatic legal acceptance, lifecycle, invoice, payment or external-message effects. Hosted PostgreSQL and legal acceptance remain unverified. |
| 118 | Cross-domain closeout assessment | Implemented locally | Read-only current overview joins operational blockers, handover, client response/review freshness, formal changes and selections, reconciled receivables/payables by currency, warranty and aftercare. It keeps operational completion distinct from follow-up and always leaves legal acceptance, contractual closure and payment release undetermined. SQLite API/UI coverage passes; hosted PostgreSQL and legal interpretation remain unverified. |
| 119 | Change impact to contract and customer decisions | Implemented locally | Scenario analysis now includes the current approved commercial-scope snapshot, affected task dependencies and recorded client decisions; client-selection changes stale retained analysis, while only approved customer outcomes update the commercial-scope source. Open questions remain distinct from accepted decisions, and no automatic task/quantity relation is inferred. Full local API/unit/frontend and production browser/mobile accessibility checks pass; external/legal and PostgreSQL acceptance remain unverified. |
| 120 | Explicit client-decision links in change impact | Implemented locally | Owner/office operators can explicitly link a client decision to active same-job tasks or material requirements with a rationale; links are audited and idempotent, and only scenario-matched decisions appear in impact results. Link changes refresh the dossier and invalidate retained preview context. Portal responses expose only a public selection summary, not internal link rationales. These links do not change scope, quantities, scheduling, or orders. Focused API, role, privacy, UI and production-browser coverage passes; hosted PostgreSQL and external/legal acceptance remain unverified. |
| 121 | Material-impact trace to explicit supplier order lines and receipts | Implemented locally | For a changed material requirement, the office preview traces only order lines whose materialRequirementId explicitly matches, displays order/supplier/status/required-by and ordered/received/accepted/damaged/outstanding quantities, and counts supply only from actually issued external commitments. Receipt headers and lines are source-bound so new receipt evidence makes retained analyses stale. No order mutation or inferred name-only link. Focused domain/API/receipt/UI and production Chromium coverage passes; PostgreSQL-hosted parity remains unverified. |
| 122 | Client-decision links to takeoff items and controlled drawing revisions | Implemented locally | Client choices can be explicitly linked to verified takeoff items and current, integrity-checked drawing revisions. Impact previews match changed quantities and exact pending drawing replacements to those links; drawing lineage, approval state and source hashes are validated, and approval makes prior analysis stale. No drawing publication or automatic scope, quantity, schedule or order mutation. Full Node (820 pass, 47 PostgreSQL skips), frontend (197 pass), lint, build and focused production browser test passed; bundle budget remains over its existing limits and hosted parity is unverified. |
| 123 | Source-bound customer choice from conversation analysis | Implemented locally | Office can prepare a private question/options/deadline draft from a current inbound AI request finding. The approval review displays exact options, rationale and original quote; approval revalidates conversation and analysis before publishing only to the scoped portal. Rejection and stale-source cases stay hidden; no outbound message or inferred agreement. API integration verifies AI-derived publication through customer response and separate office approval without leaking internal analysis data. Full Node suite: 821 passed, 47 PostgreSQL tests skipped; frontend: 198 passed; repository lint and production build passed; connected-experiences browsers: 2 passed; client-response browser workflow: 1 passed. Bundle gate remains above unchanged limits: gzip 641,358/578,500, Brotli 554,491/540,000, client delivery 8,548/8,500, recovery case 3,185/3,000, replacement plan 1,615/1,600, recovery actions 1,024/900. EU-hosted PostgreSQL remains unverified. |
| 124 | Early missing-check-in review after a released shift huddle | Implemented locally | The office action queue flags a huddle-rostered scheduled/active assignment only after its planned start plus 30 minutes, while it remains in-window and no attendance exists. The action is linked to the exact job, worker, assignment and integrity-checked huddle snapshot; attendance makes it disappear. Blocked/tampered huddles fail closed. It asks office to verify and never infers illness/absence or changes commitments. Six focused daily-cycle domain/API tests and three production Chromium workflows pass. PostgreSQL parity and unsynced-device acceptance remain unverified. Existing bundle budgets remain red at gzip 641,447/578,500 and Brotli 554,686/540,000; no limit was raised. |
| 125 | Sudden unavailability invalidates standby replacement workflow | Implemented locally | A newly reported hard unavailability revokes only overlapping standby call-outs; linked pending approvals and provisional replacement assignments are cancelled atomically, while original assignments and non-overlapping offers remain unchanged. Worker account suspension uses the same cleanup and audit path. Focused ledger regression and worker UI response tests pass; hosted PostgreSQL parity remains unverified. |
| 126 | Legacy portal messages join the canonical conversation | Implemented locally | New submissions through the legacy client-text API are transactionally linked to the exact active portal access, reusing the existing communication ID and timestamp without a duplicate record. The compatibility response identifies that nothing was sent externally. Client-token integration coverage passes; hosted PostgreSQL parity remains unverified. |
| 127 | Explicit historical client-message review and import | Implemented locally | Office can explicitly list older inbound text only when exact retained portal-access provenance matches an active link; owner/approver imports one record at a time with ID/time preservation, idempotency, audit and integrity checks. Unknown/mismatched provenance stays untouched and nothing is sent. Focused UI tests (14), full Node suite (826 pass, 47 PostgreSQL skips), lint and build pass; hosted PostgreSQL and production-browser acceptance remain unverified. |
| 128 | Day-level opportunity crew-capacity check | Implemented locally | Opportunity demand can be allocated to dated workdays per trade; the ledger validates dates and reconciles each distribution to the trade total, then compares each day's demand against profiled workers after retained allocations, assignments and availability. A known aggregate total without daily shape stays unknown and cannot pass the bid capacity gate; concentrated daily peaks remain visible even when total window hours fit. This remains advisory and does not assess skills/credentials, route time, dependencies, materials, supervision or unregistered labor. Full Node (829 pass, 47 PostgreSQL skips), frontend (201 pass), lint, build and production-bundle opportunity browser workflow (1 pass) passed; hosted PostgreSQL remains unverified. |
| 129 | Opportunity material readiness, pipeline contention and job conversion | Implemented locally | Opportunities retain exact catalogue material IDs, units and quantities. Bid review compares those needs with physical company stock less active job reservations and reports other open, unconverted opportunities requesting the same exact item. Unknown IDs and unit mismatches remain unknown; future deliveries are excluded. Inventory and pipeline changes alter the source hash and stale approved decisions. Conversion atomically creates exact linked job material requirements, is replay-safe, and refuses a vanished or changed catalogue source without partial creation. No opportunity reserves stock or places orders. Full Node suite (832 pass, 47 PostgreSQL skips), frontend (201 pass), lint, production build and production-bundle opportunity browser workflow (1 pass) pass; hosted PostgreSQL parity remains unverified. |
| 130 | Qualification-aware acquisition capacity and job conversion | Implemented locally | Each opportunity trade can name exact requirements from the workforce qualification catalogue. Only approved, integrity-checked, current credentials count toward dated role capacity; missing, pending, expired or invalid evidence excludes those hours, and credential source changes stale a pending bid approval. Conversion atomically creates the same mandatory, role-specific job qualification requirements, which existing placement, access and start checks enforce. A minimal catalog API avoids returning the full workforce register to the editor. Full Node suite (833 pass, 47 PostgreSQL skips), frontend (201 pass), lint, production build and production-bundle opportunity browser workflow (1 pass) pass; hosted PostgreSQL parity remains unverified. |
| 131 | Worker-requested release of an assigned position | Implemented locally | An admitted worker can ask the office to release their own linked work-board placement using a bounded reason category; personal medical/family narrative is neither requested nor retained. The current assignment and access remain intact pending review. Approval revalidates the exact assignment/application, blocks checked-in attendance, then releases the assignment and closes the linked application atomically; rejection leaves both unchanged. Focused Node/API, frontend and production Chromium mobile workflow tests pass; hosted PostgreSQL parity and independent field-user acceptance remain unverified. |
| 132 | Work-board task scope flows into the field work pack | Implemented locally | Position-linked task IDs now persist on normal placements and filter the assigned worker's pack, task-derived context, progress eligibility, linked quality/photo checks, and explicitly linked material requirements/site issues. Explicitly assigned and supervisory tasks remain visible; unrelated unassigned tasks are hidden. Legacy positions with no task links preserve the existing shared-task behavior. Drawing and equipment scope are tracked in phases 133 and 134; universal subcontractor isolation, hosted PostgreSQL parity and independent field-user acceptance remain open. |
| 133 | Governed drawing revisions follow explicit position task scope | Implemented locally | Office can link up to 50 same-job tasks to a drawing revision. The sorted IDs are included in the source hash, revision snapshot and replay fingerprint; replacements inherit links unless the operator explicitly clears or changes them. For a position with task scope, the field pack includes only current approved drawings linked to visible tasks; whole-job and unlinked drawings are not leaked into that scoped pack. Legacy positions retain prior all-current-drawings behavior. Focused domain/work-pack tests and drawing-register browser flow pass; hosted PostgreSQL parity and field acceptance remain open. |
| 134 | Equipment reservations follow visible task scope in the field pack | Implemented locally | Existing task-linked tool reservations are now projected only when active and linked to a task visible in a position-scoped work pack; unlinked and unrelated-task reservations are withheld, and closed reservations disappear. The pack includes current custody status/due-back and a boolean for the current worker without exposing another worker's identity. Legacy unscoped assignments retain active job equipment. Focused field-pack tests pass; hosted PostgreSQL parity and field acceptance remain open. |
| 135 | Position scope is consistent across field job and drawing routes | Implemented locally | The generic field job detail now shares the work-pack task scope across tasks, assignments, materials, active reservations/custody, current drawings, and task-linked progress/quality records. Drawing lists enforce current task-linked visibility; both content-download routes additionally require an approved, integrity-valid PDF. Commercial issue packages are office-only. Integration regressions prove an unrelated task/drawing is absent and its generic download returns 404. `npm run lint`, the focused Node suite (17/17 after the final identity guard; 40/40 before it), and the production-bundle field browser workflow (1/1) pass; broader field-project collections, hosted PostgreSQL parity and independent field acceptance remain open. |
| 136 | Worker safety and site-access records are personally scoped | Implemented locally | The generic field projection limits orientations and site-access logs to the authenticated worker's active assignment; safety briefings require that worker's attendee record, and pre-task plans require an attendee linked to the worker's active assignment. Standalone safety-briefing and pre-task-plan lists use the same assignment check. The API regression verifies peer orientation, access-log, briefing, assignment and task details are absent while the worker's own records remain visible. Focused field API/work-pack tests pass (16/16); broader legacy collections, hosted PostgreSQL parity and independent field acceptance remain open. |
| 137 | Production baseline task links and private field progress | Implemented locally | Production plan lines may link only to same-job tasks; links cannot be changed after retained output. Field workers see and record only lines linked to visible assigned tasks, and their own entries and scoped productivity measures; peer output, crew aggregates, labor budgets, cost codes and approvals remain office-only. The office editor exposes task linking while preserving office-only unlinked lines. Production/field API and ledger regressions (6/6) and the frontend linkage test (1/1) pass; hosted PostgreSQL and independent field acceptance remain open. |
| 138 | Task-scoped approved submittal projection for field dossiers and work packs | Implemented locally | Office can explicitly link a submittal to up to 50 same-job tasks and select attachments from retained, checksum-verified PDFs; approval freezes and revalidates exact task and attachment references plus each PDF's ID, filename, MIME type, size and SHA-256. Pending content changes reject approval; post-approval changes hide the PDF. Task-scoped dossiers and mobile work packs receive approved job-wide or matching-task records only. Work packs expose actual same-job retained PDFs through worker-bound, source-hash-bound no-store routes; generic document downloads cannot bypass submittal task scope; offline PDFs share the 50-file/12 MB cap. Peer-task items, drafts, pending records, arbitrary references and post-approval tampering remain inaccessible. Focused SQLite service/API and offline-download tests pass. Hosted PostgreSQL parity, broader UI/browser verification and independent field acceptance remain open. |
| 139 | Approved JHA projection for field dossiers | Implemented locally | Field job detail exposes only operationally released JHAs backed by their exact approved ledger decision. Workers receive the approved work method, hazards, controls, PPE and stop-work triggers, not reviewer, assignee, internal notes or approval metadata. A focused API regression excludes draft JHAs and verifies the field-use safety content. JHAs remain job-wide until task links are implemented; PostgreSQL parity and independent field acceptance remain open. |
| 140 | Approval-backed SDS safety information in field experiences | Implemented locally | Both the field dossier and mobile work-pack knowledge view now require a current, unexpired, integrity-valid SDS with its exact approved ledger decision. The worker sees bounded product, hazard, PPE, first aid, fire, handling, spill, disposal and emergency information; unapproved legacy current records are withheld. API and UI regressions cover the projection. Hosted PostgreSQL parity and independent field acceptance remain open. |
| 141 | Governed SDS PDF retrieval and offline availability | Implemented locally | A worker-bound, source-hash-bound route serves only the assigned worker's current exact-approved SDS PDF after integrity, size, signature and checksum checks, and rechecks state after storage read. Online UI download and encrypted offline pack both use that route; PDF bytes are reverified client-side. API, stale-hash, wrong-worker, cross-job, superseded-revision and offline-budget regressions pass. Native device acceptance, PostgreSQL parity and independent field acceptance remain open. |
| 142 | Approval-bound SDS material mapping and task-scoped field visibility | Implemented locally | Governed SDS revision snapshots and replay fingerprints now retain sorted same-job material-requirement links; replacement revisions inherit them unless explicitly changed. Both the mobile work pack, field job dossier, and SDS list endpoints withhold unlinked or unrelated SDS records from task-scoped positions. Cancelled material links stop projecting; unscoped legacy assignments retain job-wide approved SDS behavior. Domain/API/browser regressions cover tampering, foreign IDs, revision inheritance, unrelated products and field visibility. Hosted PostgreSQL parity and independent field acceptance remain open. |
| 143 | Material SDS applicability and pre-start safety gate | Implemented locally | Each active material has an audited `unreviewed`, `required`, or `not_required` decision with rationale and replay key; only an owner/approver can record `not_required`. Linking a governed SDS immediately makes the material required, and a pending/current linked SDS prevents an unsafe waiver. The field work pack blocks start release when applicability is unreviewed, an approved current PDF is missing, or the PDF is absent from the assigned pre-task plan. API, frontend and browser regressions cover role boundaries, replay, linked-sheet conflicts and visible blocking. Hosted PostgreSQL parity and independent field acceptance remain open. |
| 144 | Invalid accepted scope changes visibly block field release | Implemented locally | The field work pack now separates verified authorized variations from accepted records whose source integrity/authorization requires office review. Review-required changes are no longer filtered out; they appear as a worker warning and prevent start release until office review. Regression coverage uses the actual approval, verified delivery and acceptance path, then tampers with retained scope to confirm the hold. Full PostgreSQL parity and independent field acceptance remain open. |
| 145 | Material shortages allow safe resequencing of independent work | Implemented locally | Resource planning now holds tasks with unknown material availability and their finish-to-start successors, while still proposing a partial schedule for independent work. Existing scheduled windows on held tasks remain unavailable to their assigned worker. All-held plans remain blocked; partial plans are explicitly labeled in the UI and stored in the approval evidence, and only schedulable tasks change after independent approval and fresh source validation. Resource-planner/schedule/API tests pass (23/23); work-plan production-browser tests pass (8/8). Hosted PostgreSQL parity and independent field acceptance remain unverified. |
| 146 | Overdue recovery follow-ups rise in the company-wide queue | Implemented locally | Portfolio ordering now keeps safety, integrity and critical-path items first, then raises overdue follow-ups above newer non-critical disruptions; normal triage and impact ordering apply afterward. The overdue warning and attention filter remain visible. Portfolio frontend tests pass (4/4); authenticated production-browser disruption coverage is tracked separately. |
| 147 | Opportunity capacity reservations are assignment-specific | Implemented locally | Daily crew-capacity assessment no longer lets any reservation for a worker/day implicitly cover every overlapping assignment. Only current allocations tied to the exact active assignment cover that commitment; another overlapping assignment without its own day allocation creates an explicit unknown-capacity blocker, and closed-assignment allocations no longer consume the bid window. Assignment/job/task relationships are part of the source hash. Bid-decision, opportunity-pipeline and crew-capacity focused Node tests pass (20/20); full suite, hosted PostgreSQL parity and live operator acceptance remain unverified. |
| 148 | Combined workforce, material, client-date and cost recovery | Implemented locally | One source-bound recovery case now passes the integrated absence + material shortage + accepted contract date + approved actual expense scenario through independent replacement approval, replenishment, mandatory reassessment, date review and evidence-backed resolution. Fixed historical availability lookup after replacement to use canonical assignment records. Focused Node/API suites (48/48), recovery React suites (22/22), and production-browser recovery flows (5/5) pass, including the complete combined dashboard journey, mobile-width and axe checks. PostgreSQL parity, live communications and independent site acceptance remain unverified. |
| 149 | Interrupted actual-cost attribution recovery | Implemented locally | The recovery cost form now retains the selected approved cost source, amount, rationale and correction target in the authenticated operator's session draft, scoped to the exact recovery-case source hash. A refreshed or changed source cannot silently reuse the old form. Recovery actions remain disabled while a sub-review refreshes its source and case hashes, preventing stale-case conflicts in rapid follow-up actions. Focused component and production-browser coverage pass; lint, production build and release contract pass. The existing 602.04 kB main-chunk warning remains; full suite, PostgreSQL parity and live acceptance remain unverified. |
| 150 | Complete customer-visible conversation analysis | Implemented locally | Local AI analysis pages inbound customer messages and published office replies oldest-to-newest, bounded to 1,000 messages/2 MB and analyzed in sequential context-aware batches; exceeding a limit fails without a partial result. Unpublished office drafts are excluded from text and image analysis. Durable job leases accommodate the bounded windows, the office review reports the batch count, and source links load older timeline pages before navigating to evidence. Conversation domain/analysis tests pass (24/24), API route test passes (1/1), UI tests pass (15/15), targeted lint and production build pass. PostgreSQL queue parity is skipped without a configured database; full-suite and live local-model interpretation remain unverified. |
| 151 | Durable worker notification inbox | Implemented locally | Worker accounts receive retained, account-scoped notices for standby call-outs, position offers and confirmed placements; notices survive refresh/restart, show unread state and can be marked read idempotently. Offers include schedule, duration and location; confirmed placements also include the private work address, link directly to the worker's placements and state that placement is not start authorization. API authorization rejects cross-account reads. Focused Node/API/call-out tests pass (26/26), worker-board component tests pass (12/12), mobile production-browser flow passes (1/1), targeted ESLint and production build pass. PostgreSQL parity, external/background push and native-device acceptance remain unverified. |
| 152 | Offline worker notification continuity | Implemented locally | The encrypted field vault stores a bounded, privacy-minimized snapshot of the authenticated worker inbox alongside offline work packs; it excludes action links and internal IDs, clearly shows its save time and stale/offline boundary, and refreshes only after explicit online synchronization. Company field-worker sessions can read their inbox strictly by their authenticated worker scope. Snapshot, offline UI, scoped API and production-bundle offline browser tests pass. Native-device acceptance, PostgreSQL parity and background push remain unverified. |
| 153 | Standby call-out lifecycle notifications | Implemented locally | When new unavailability invalidates pending standby call-outs, the revocation and worker inbox notices are recorded atomically; actual offer expiry also creates one idempotent notice. The notices state the job/trade/window and status without exposing the private availability reason. Focused work-board domain and standby API suites pass (25/25), and targeted ESLint passes. PostgreSQL parity, native-device acceptance and background push remain unverified. |
| 154 | Approved field-question answers reach the worker | Implemented locally | An office approval for a worker-originated RFI answer atomically creates one idempotent person-scoped inbox notice containing only the released response; pending/rejected and unrelated RFIs do not notify. Added a forward migration that preserves existing local inbox records and admits the new notice type, plus API and worker-inbox UI coverage. Focused field-pack, work-board and approval suites pass (47/47); worker inbox component tests pass (12/12), and targeted ESLint passes. Hosted PostgreSQL migration execution, native-device acceptance and external push remain unverified. |
| 155 | Dossier review carries explicit, versioned source-coverage evidence | Implemented locally | Each dossier review audit record now records completeness and row counts for the 15 configured job-scoped source tables, presence of seven derived source sets, and the ten controls evaluated. A full round cannot claim completion when any report lacks the current manifest or a review fails; an interrupted prior-version round restarts. Coverage version and gaps are visible in the dashboard. Contractor-review/API suites pass (18/18), control UI tests pass (9/9), targeted ESLint passes. Remaining scope: cursor-paged reads for very large source registers, other ledger domains outside manifest v1, hosted PostgreSQL execution and operational acceptance; this is not a full-company certification. |
| 156 | Task-scoped approved JHA projection and review path | Implemented locally | JHA safety definitions retain sorted same-job task links and a hash over hazards, controls, method, PPE and stop triggers; the exact approval must bind the same definition. The field dossier and work pack, including encrypted offline snapshots, expose only intact approved JHAs intersecting a position's visible tasks and return only the overlapping task IDs. Legacy unlinked JHAs remain available only to unscoped legacy assignments. The safety queue detects uncovered position tasks; its existing office action prepares a new draft linked to active tasks, copying prior content only as a starting point for human re-review. Foreign-task, peer-task, missing-link and post-approval tamper cases are covered. Hosted PostgreSQL and independent field acceptance remain unverified. |
| 157 | Task-level JHA applicability and start-release gate | Implemented locally | Active tasks default to unreviewed applicability. Office can explicitly require a JHA; only an owner/approver can record not-required with rationale. The decision is idempotent, audited, and bound to task title, description, required trade and linked materials; source changes return needs-review. The safety queue follows actual visible task scope for active assignments, including legacy unscoped assignments. Field users receive status only; start release requires review, and required tasks need an exact-approved task-linked JHA included in an assigned pre-task plan whose integrity-bound task scope covers that task. New version-two plan snapshots bind selected task coverage and exact JHA; legacy version-one plans remain readable but gain no inferred coverage, with a compatibility regression resolving an original-format approval. A plan containing the same JHA for another task fails the release gate. Focused API/domain tests (23/23), office/field component tests (23/23), targeted ESLint, production build and mobile browser E2E pass. Hosted PostgreSQL parity and independent field acceptance remain open. |
| 158 | Worker position discovery | Implemented locally | Authenticated workers can search returned open-position listings by published title, place, role, description, materials, equipment, prerequisites and additional skills, and filter by trade. Result counts and no-result feedback are accessible and responsive. This does not expand server results or alter eligibility/placement checks. Focused frontend tests pass (25/25); mobile production-browser worker workflow passes with position filtering, axe and overflow checks. Hosted PostgreSQL parity and independent worker acceptance remain unverified. |
| 159 | Public-position privacy gate | Implemented locally | Server publication rejects worker-visible title/role/city/description/material/equipment/prerequisite text that contains the known client name/company, exact job/client address, email or phone. Error responses return categories only, not matched values; safe city-only content remains publishable. Existing positions are re-evaluated on reads and blocked from worker listing/enrollment/offer acceptance when current privacy/source checks fail; existing assignments remain retained. Domain/API tests cover normalized name, email, formatted phone, exact address, safe publication and retrospective reads. This is targeted matching, not general DLP. Native APK/device acceptance remains unverified. |
| 160 | Opt-in waitlist offer coordination | Implemented locally | Position terms can opt into one automatic expiring in-app offer to the oldest eligible waitlisted worker when capacity opens. The durable autonomous scheduler runs the sweep only after a successful enabled cycle. One pending offer blocks the queue; stale source, incomplete admission/eligibility, decline, expiry or insufficient response time pauses for owner review rather than skipping or repeatedly offering. Worker acceptance reruns existing checks; no external message, automatic final placement or approval bypass is introduced. Work-board domain tests pass (33/33), focused office UI tests pass (18/18), touched-file ESLint and production build pass with the existing 602.96 kB main-chunk warning. Live scheduler deployment, PostgreSQL concurrency and operator/worker acceptance remain unverified. |
| 161 | Opt-in standby offer after worker-reported absence | Implemented locally | Published positions can explicitly enable one internal, time-limited offer to the first currently eligible worker who has declared overlapping standby. The durable scheduler handles active absences; current admission, trade/qualification, availability, source freshness and minimum-notice checks run before offer creation. Pending offers suppress duplicates, including overlapping shifts on another job for the same worker; decline, expiry, missing/stale candidates or inadequate response time require owner review rather than automatic candidate skipping. Offers stay in the private worker portal; acceptance only permits the contractor to request replacement through the separate approval path. Policy is immutable with published terms, off by default, and excluded from worker-facing projections. Full domain tests pass (35/35), office UI tests (19/19), targeted ESLint and production build pass. Live scheduler enablement, PostgreSQL concurrency and independent operator/worker acceptance remain unverified. |
| 162 | Field-reported equipment safety quarantine | Implemented locally | Assigned field workers can report malfunction, damage or unsafe condition only against a task-linked reservation physically checked out to themselves. Online, encrypted browser-offline and native Android offline paths retain the source-scoped report and synchronize through one server validator. The report places the tool in maintenance, creates an open operational recovery source, blocks new reservations and direct availability edits, and stays unresolved after return. Only passing inspection or completed maintenance with retained evidence releases the hold. Four Node suites pass (52/52), authenticated API (1/1), React field UI (22/22), OfflineField (4/4), targeted native/offline (3/3), ESLint and production build pass. Android APK build is unverified because Java/JDK is unavailable; hosted PostgreSQL and independent site acceptance remain open. |
| 163 | Cross-job equipment-outage recovery | Implemented locally | An unavailable reserved tool now surfaces all active reservations for that same tool across jobs, with exact counts and explicit truncation above 500. Recovery cases retain that impact and a bounded candidate list based only on exact registered category, an explicit reservation window, available status, current inspection readiness, no open safety hold or retirement approval, and no overlapping or unknown-window operational booking. The operator view labels candidates unverified and requires human checks of technical fit, accessories, condition, location and safety; no reservation or reassignment is created. Focused recovery/domain/API tests pass (45/45), recovery UI tests (15/15), targeted ESLint and production build pass. All five existing recovery browser workflows passed across the focused run and a rerun after correcting an outdated offline-sync confirmation expectation. The build retains the existing 602.98 kB main-chunk warning. Hosted PostgreSQL and independent field acceptance remain open. |
| 164 | Owner-verified subcontractor access to positions | Implemented locally | Public registration company names and submitted IDs remain untrusted. An owner can link a worker account to an active subcontractor/both record with an audit-retained verification reference; a declared-name mismatch requires a separate explicit owner identity-review confirmation and is audited. Positions may be left open or targeted to one active subcontractor. Worker listing, enrollment check, direct enrollment and placement preflight enforce the same verified membership, returning not-found to unmatched applicants. Verification can be added to an already-admitted account. Focused Node work-board/domain/API tests pass (38/38), office UI tests (22/22), targeted ESLint and production build pass. This covers position discovery and placement only; full company-wide isolation of all job, evidence, message, notification and offline-pack data remains open. Hosted PostgreSQL parity and independent subcontractor acceptance remain unverified. |
| 165 | Subcontractor scope through absence and replacement | Implemented locally | Company-targeted assignments retain the required subcontractor identity. Replacement candidates and standby callouts must still belong to that active, owner-verified company; checks repeat when replacement is requested and independently approved, so a later suspension or membership change blocks placement. Legacy linked positions are checked against their current canonical terms. Manual standby can keep multiple offers open, while the autonomous scheduler excludes workers already offered an overlapping shift; acceptance remains a final double-booking guard. Focused work-board/domain/API and availability suites pass (60/60); targeted ESLint passes. This does not yet isolate all company data across jobs, evidence, messages, notifications or offline packs. Hosted PostgreSQL parity and independent subcontractor acceptance remain unverified. |
| 166 | Revoke targeted assignment details when subcontractor verification changes | Implemented locally | When a targeted subcontractor becomes inactive or a worker's verified membership no longer matches, active assignment access is rechecked for field job projections, work-pack listing and retrieval, and assignment-related notices. The worker loses private job/work-pack details; notices are reduced to a generic unavailable message. Candidate-specific offers and standby call-outs remain visible only to their addressed, currently eligible worker. Older role tokens with explicit job IDs retain their existing read listing scope but cannot mutate work without a named worker identity. Focused work-board/work-pack suites passed (60/60), the role-scope regression passed, and targeted ESLint passed. Other company-owned records and hosted PostgreSQL parity still need a repository-wide isolation pass and verification. Independent field acceptance remains open. |
| 167 | Enforce company scope across mixed project assignments | Implemented locally | Field access now includes only active assignments with a current matching owner-verified company membership; project-detail projection rechecks that authorization itself. Task-scoped visibility is forced when another active position has separately linked tasks, preventing those tasks and task-linked materials, drawings and safety context from leaking through an otherwise unscoped assignment. Legacy role tokens without named worker identities cannot read a job containing active company-targeted assignments or open targeted positions, even when its job ID is explicitly listed. Focused field/work-board/company-scope suites pass (61/61), the API role-scope regression passes (1/1), and targeted ESLint passes. Other non-task-linked evidence and company-owned records still need the wider isolation audit; PostgreSQL parity and independent field acceptance remain open. |
| 168 | Restrict field evidence downloads to verified document routes | Implemented locally | The generic field document endpoint now denies non-drawing files; SDS and approved submittal PDFs must use the existing current-work-pack, source-hash-bound routes. Generic drawing retrieval revalidates assignment, company membership, approval, visibility, storage identity and checksum after reading bytes. Raw field-job document metadata is limited to visible drawings and current SDS documents linked to visible materials. Focused work-pack, SDS, drawing, asset-history and inspection-coverage API suites pass (5/5); targeted ESLint passes. This does not yet establish a complete access matrix for every evidence type or hosted PostgreSQL parity; independent field acceptance remains open. |
| 169 | Scope field project collections to the worker's verified assignment | Implemented locally | Added a request-scoped visibility cache and reused the canonical field job projection to filter permits, pre-task plans, LMRA, installation QC, photo evidence, safety briefings, attendance, material receipts, daily cycles, daywork tickets, environmental activities, expenses, NCRs and equipment custody plans. Material receiving plans now reveal only assigned material requirements and recompute visible counts. NCR visibility also checks reporter and assignment/task scope; a peer-worker regression exposed and now covers that leak. Existing field-safe response projections remain applied after filtering. The original focused work-pack and attendance tests passed; phase 172 later corrected the daily-cycle fixture/status and migration assertion. Complete collection/access inventory, PostgreSQL parity and independent field acceptance remain open. |
| 170 | Bind field mutations and material receipts to work-pack scope | Implemented locally | Task lifecycle updates and material receiving now reject task/material IDs outside the worker's canonical work-pack projection. Job-site receipt responses reveal only the authenticated worker's receipt and necessary issue totals, not another receiver's evidence or internal allocation details; idempotent replay is actor-bound. Focused field-work-pack, shared-stock and material-receiving API tests pass (3/3), plus targeted ESLint, syntax and diff checks. Full access inventory, PostgreSQL parity and independent field acceptance remain open. |
| 171 | Enforce task scope across remaining field evidence writes | Implemented locally | A shared validator now checks nested task references against the canonical worker work pack across general progress, reports, observations, incidents, punch/safety checks, time and daily logs, cycles, daywork, NCR and environmental capture. Evidence uploads reject inaccessible task/photo workflows before accepting files; upload-generated ledger actions record the authenticated actor. Focused API suites (3/3), targeted ESLint, syntax and diff checks pass. Complete access inventory, PostgreSQL parity and independent field acceptance remain open. |
| 172 | Bind daily-cycle and safety acknowledgements to assigned workers | Implemented locally | Field cycle reads require the worker to be in the retained crew, and only the retained lead can submit end-of-day; peer cycles are hidden and cannot be closed through a guessed ID. Safety briefing acknowledgement requires the briefing to be assigned in the worker's filtered projection. Peer-cycle and peer-briefing API regressions pass; focused daily-cycle and field-work-pack suites (2/2) and targeted ESLint pass. Full authorization inventory, hosted database parity and independent field acceptance remain open. |
| 173 | Bind field inspection and equipment actions to assigned scope | Implemented locally | Inspection submissions require a worker-bound identity and an inspection in the current work pack; assigned installation QC remains worker-bound and job-scoped legacy access is limited to explicitly declared job IDs. Field equipment checkout requires a visible reservation, and return requires custody to belong to the authenticated worker. Added peer-inspection and peer-custody regressions; repaired QC projection lookup for inspectionId-only records. Full Node suite passes (926: 879 pass, 47 skipped, 0 fail), full ESLint passes, API readiness and dashboard HTTP checks pass. PostgreSQL-hosted tests are skipped without a configured database; independent field acceptance remains open. |
| 174 | Require worker acceptance before office-originated placement | Implemented locally | The legacy office confirmation endpoint no longer turns open interest or a waitlist entry directly into an assignment; an existing placement remains idempotent. Held, waitlisted and material-ready cases use a revision-bound offer accepted by the worker, while ready available workers retain direct self-enrollment. Work-board domain/API suites pass (40/40), including a route regression proving office confirmation leaves interest unchanged. Targeted lint passes; hosted PostgreSQL parity and independent operator acceptance remain open. |
| 175 | Correct operational recovery portfolio filters | Implemented locally | `Actie nodig` now shows missing/overdue follow-ups, stale/unverifiable sources, material holds, open quality cases, unavailable equipment and other unresolved impacts; `Monitoren` shows cases that do not currently meet those attention conditions. Added component regressions for both filters, including quality and equipment holds with future due dates. Focused frontend tests pass (4/4), targeted ESLint passes, and the production build passes with the existing 602.98 kB main-chunk warning. Recovery completeness, hosted PostgreSQL parity and independent operator acceptance remain open. |
| 176 | Bind weather readiness to the planned work window | Implemented locally | Schedule readiness treats an assessment as current only when captured within 12 hours and forecast for within one hour of planned start; stale/mismatched data stays unknown and triggers reassessment for outdoor work. Manual unsafe, heat, wind, storm and visibility conditions are recognized as review risks, and the global weather summary labels stale data. The office form ties its assessment to the selected start. Weather suites pass (7/7), the existing dispatch API acceptance test passes, targeted ESLint and production build pass (main chunk 603.18 kB, above the 600 kB warning threshold). This remains planning evidence, not site safety clearance; full-shift exposure, hosted PostgreSQL parity and real-world forecast/field acceptance remain unverified. |
| 177 | Route approved client answers to task-scoped field packs | Implemented locally | Office may opt a current client-message/photo RFI into field sharing and select active job tasks. The exact answer is exposed only after its approval resolves, only to field workers whose current work-pack task scope intersects those selected tasks, and only while the client access and analyzed source remain current. The projection omits customer quotes and AI suggestions; the approval summary names receiving tasks, and the new content changes the work-pack source hash without altering scope, dates, safety controls or start authorization. Client-conversation and field-work-pack Node suites pass (9/9 and 20/20); conversation and field-work-pack UI suites pass (16/16 and 23/23); targeted ESLint and production build pass. Existing 603.18 kB main-chunk warning remains; PostgreSQL parity and independent office/field acceptance remain open. |
| 178 | Notify task-matched field workers of approved client information | Implemented locally | The exact approval flow now creates one durable inbox alert for every currently assigned worker whose live work-pack task scope intersects the shared client RFI. Alerts direct workers to reopen their pack and omit all customer text, answer content and AI analysis; source/access/scope are revalidated on inbox read and stale alerts are sanitized. API coverage also verifies the pack hash advances and old revisions cannot drive later field actions. The focused work-board, field-work-pack API and client-conversation suites pass (49/49); targeted ESLint and Node syntax checks pass. No external push, WhatsApp, email, PostgreSQL or live operator acceptance is claimed. |
| 179 | Share approved field reports through the client conversation | Implemented locally | Office can prepare an editable private chat draft from an approved client-visible report in the same job. The draft is idempotent and bound to the exact report revision/hash; its provenance is office-only. Report approval/visibility and active client access are rechecked when the message itself is approved and again when explicitly published. Approval and publication remain separate; no external channel is invoked. Client-conversation domain/API tests pass (11/11), Conversation UI tests pass (17/17), targeted ESLint and backend syntax checks pass, and the production build passes with the existing 603.18 kB main-chunk warning. PostgreSQL parity and independent operator acceptance remain open. |
| 180 | Bring approved office replies into the open native work pack | Implemented in source; native build unverified | The foreground Android work-pack screen polls the authenticated worker's job-scoped reply feed every 30 seconds when online, merges approved reply state into the encrypted local vault and announces newly approved replies without a screen reload. It stops on pause/navigation and does not create background work or push notifications. The reply API and worker scoping pass existing integration coverage; new native-source contract and offline work-pack tests pass (14/14), and the field-work-pack API acceptance test passes (1/1). Android compilation and device acceptance remain unverified: this environment has no Java/Android SDK/adb installed and SDK terms have not been accepted. |
| 181 | Share released field photos in customer conversations | Implemented locally | Office can select only current, checksum-verified photos from a same-job evidence set whose exact review remains approved and released. The photo is linked to its existing private document, not duplicated; the client text plus image remain hidden until a separate communication approval and explicit publication. Approval and publication revalidate set, capture, document hash, review and portal scope. Office-only source provenance is withheld from client projections and media remains token-scoped/no-store. Tests pass: 11/11 conversation domain, 18/18 conversation UI, full release-to-customer HTTP photo flow (1/1), and conversation API suite (1/1); hosted PostgreSQL parity and independent customer/office acceptance remain open. |
| 182 | Keep internal and peer-task RFIs out of field project detail | Implemented locally | Field project detail no longer returns office RFIs or unapproved client questions. It shows field-worker-originated work-pack RFIs only to their author, and customer-conversation answers only after approval and only when the explicit shared task intersects that worker's live work-pack scope. A regression checks hidden office/pending content, approved own-task answer visibility, and peer-task isolation. Field-work-pack API integration passes (1/1); broader record-by-record company isolation and hosted PostgreSQL parity remain open. |
| 183 | Bind safety incidents to their verified reporter and task | Implemented locally | Field-submitted incidents now take the reporter identity from the authenticated worker account, accept only task references belonging to the same job, and retain reporter/task IDs in the ledger and idempotency hash. Field job detail fails closed for legacy/unattributed and colleague incidents, with task scope applied in addition to reporter identity; office incident access remains unchanged. Regressions cover reporter spoofing, own versus peer task incidents, cross-job task rejection, exact replay and task-bound replay conflicts. Focused incident/work-pack API tests pass (5/5); broader company isolation and hosted PostgreSQL parity remain open. |
| 184 | Enforce minimum notice on standby position offers | Implemented locally | Position offers to workers whose declared standby period overlaps the shift now check the retained minimum notice at offer creation and again at assignment. Offers must expire by the last safe response time; insufficient notice cannot be turned into a confirmed placement. The worker may still express interest without being assigned, and non-overlapping standby periods do not affect placement. Work-board and availability domain suites pass (56/56), including late offers, response deadlines, valid standby acceptance and existing position/call-out flows. API/provider acceptance and PostgreSQL parity remain separate. |
| 185 | Recurring worker availability across planning and replacement workflows | Implemented locally | Workers and office operators can record a weekly availability or standby series by weekday, explicit local time zone, and final date (maximum 366 days). Local clock inputs are converted using the selected zone; occurrences preserve wall-clock time across daylight-saving changes and nonexistent DST times fail validation. Recurrences feed assignment conflict checks, worker summaries, crew-capacity boards, opportunity forecasts, standby call-outs, and approval-backed replacements. One record represents the series; cancellation remains approval-gated for the full series, while exceptions are separate one-off periods. Verification: focused Node suites pass (69/69), worker-app/timezone component tests pass (6/6), existing workforce-availability browser tests pass (3/3), targeted ESLint and production build pass. Full-repository CI, hosted PostgreSQL parity and independent field acceptance remain open. |
| 186 | Concurrent same-trade task crew sizing | Implemented locally | Tasks can require 1-12 workers of one explicit trade. The bounded Z3 planner selects distinct qualified candidates over the same task window, prevents overlap across every selected worker and named supervisor, preserves previously approved crew membership for locked schedules, and fails closed when the qualified crew is too small or a retained member is no longer eligible. The source-hashed proposal is independently approved and revalidated before the full crew is persisted. Every crew member receives the task in their scoped field pack and reaches their own start-release checks. Verification: focused Node suites pass (42/42), production-bundle browser crew-sizing workflow passes (1/1), production build and targeted ESLint pass. Mixed roles are extended in phase 187; supervision ratios, hosted PostgreSQL parity and independent field acceptance remain open. |
| 187 | Mixed-trade crew composition | Implemented locally | A task can require up to eight distinct trade groups and twelve total workers, with one-to-twelve workers per group. The planner selects separately qualified workers for each role, prevents a worker from filling simultaneous role slots or overlapping assignments, and pins each role/member pair when a schedule is locked. Approval validation checks the exact role counts and candidate qualifications; office preview and the worker's scoped field pack show each assigned member's role. Legacy single-trade tasks remain supported. Verification: focused Node suites pass (42/42), field-pack UI suite passes (24/24), mixed-trade production-bundle browser workflow passes (1/1), production build and targeted ESLint pass. Configurable supervision ratios are extended in phase 188; hosted PostgreSQL parity and independent field acceptance remain open. |
| 188 | Configurable task supervision ratios | Implemented locally | Office may set an explicit maximum number of workers per named supervisor and select the qualified supervisors. The required minimum is derived from the full task crew size; there are no hidden or jurisdictional default ratios. Planning checks each supervisor's current job role, qualification, availability and task-window coverage, reserves supervisors once per task in the solver, and prevents double-booking. Approval revalidates the exact supervisor set and ratio. Field packs identify all supervisors and the required checked-in headcount; start release requires the configured minimum on site while checking every named supervisor's assignment, qualification and shift coverage. Verification: focused Node suites pass (43/43), field-pack UI suite passes (25/25), work-plan browser workflows pass (2/2), production build and targeted ESLint pass. Hosted PostgreSQL parity, full-repository CI, supervision-rule review by the operator and independent field acceptance remain open. |
| 189 | Joint portfolio resource planning | Implemented locally | The schedule can plan up to 48 active tasks across two to eight selected jobs in one bounded Z3 allocation. It preserves locked task/crew windows and considers outside-job assignments, qualifications, availability, capacity, dependencies, material holds, named supervisors, and directional travel only from matching current site and sourced route evidence. One source-hashed approval revalidates and applies the selected jobs atomically. Focused planner tests pass (19/19), portfolio browser workflow passes (1/1), build and targeted ESLint pass. Hosted PostgreSQL parity, larger portfolio sizing, live routing, external worker offers and independent field acceptance remain open. |
| 190 | Sequential opt-in standby fallback | Implemented locally | For positions where the owner explicitly enabled automatic standby call-outs, the durable planner expires due open offers and records a privacy-safe in-app notice, then offers the next eligible uncontacted standby worker after decline or expiry. It permits at most three sequential offers and only one open offer at once; exhaustion returns to owner review. Acceptance, owner replacement proposal and separate approval remain required, and the original assignment is unchanged. Verification: focused work-board/standby API tests pass (12/12), targeted ESLint passes and production build passes with the existing 604.13 kB app-chunk warning. Hosted PostgreSQL parity and independent field acceptance remain open. No external notifications or placement. |
| 191 | Verified missed-check-in recovery handoff | Implemented locally | A source-bound early check-in warning now offers owners/office operators a confirmation action. The server re-derives the warning, checks its source hash, and records only exact-shift unavailability after human confirmation. Confirmed periods suppress the false-missing-check-in warning and feed existing availability conflicts and opted-in standby replacement. Exact retries do not duplicate records; stale sources fail and cancelled same-source records can be restored only by reconfirmation. For a shift already underway, automatic call-out is limited to the exact office-confirmed source, an overlapping standby declaration with zero-hour minimum notice, at least 15 minutes of response time, and expiry within 30 minutes or shift end. A timely acceptance still needs a distinct approver; the original assignment remains unchanged until approval. Domain tests cover source tampering, idempotency, cancellation/restoration and non-automatic assignment changes; API tests cover office/worker authorization and stale-source rejection; workbench tests cover confirmation/request wiring (8/8), the production-browser workflow passes the warning-to-confirmed-record path (1/1), and an integrated work-board test covers confirmation through durable standby offer and separate replacement approval. Targeted ESLint passes; production build passes with the existing bundle-size warning. Hosted PostgreSQL parity and independent field acceptance remain open. |
| 192 | Replacement-worker shift briefing continuity | Implemented locally | The exact assignment and scheduled shift are now bound to the released daily huddle snapshot; private crew schedule details stay out of shared crew projections. Online, encrypted offline web and native Android work packs show only that assignment's released briefing. The latest huddle overlapping a shift must include the replacement; a later crew change invalidates an older briefing and blocks start-release eligibility until the current crew is re-briefed. A changed shift or invalid huddle integrity requires review. If no huddle exists, start release is blocked until the office records one; adjacent work dates are checked for shifts across UTC midnight. A huddle is not authorization. Verification: focused field-work-pack, API, daily-cycle and offline/native source suites pass (45/45); frontend work-pack suite passes (26/26); production browser path passes (1/1); targeted ESLint and production build pass. Native APK/device behavior, hosted PostgreSQL parity and independent field acceptance remain open. |
| 193 | Atomic task handoff after approved worker replacement | Implemented locally | Single and portfolio replacement approvals transfer explicit open task ownership, crew membership and supervisor references to the replacement in the same ledger transaction as assignment release/activation. The service verifies task-window coverage when one exists, exact trade compatibility, current qualifications, and rejects duplicate crew/supervisor membership; partial or out-of-shift task schedules fail closed and roll back the approval. Unscheduled tasks transfer with an explicit schedule-review marker and remain ineligible for hour allocation until scheduled. Current-day and future planned capacity for the released assignment is audit-cancelled; past capacity and time history are not rewritten. Task and assignment audits include approval linkage. Eight focused Node suites pass (132/132), targeted ESLint passes, and the production build succeeds with the existing 604.18 kB main-chunk warning; `git diff --check` passes. PostgreSQL parity and independent field acceptance remain open. |
| 194 | Resolve replacement-task schedule review through approved resource planning | Implemented locally | Unscheduled tasks handed to a replacement visibly require office schedule review and open the resource planner from the work-plan queue. A review marker resolves only after a complete schedule is validated against the replacement's active, approved assignment, role, qualifications and availability; failed or stale coverage leaves it unresolved. Individual and portfolio approvals now activate replacement assignments without retaining a stale `requiresApproval` flag, while separate schedule approval remains explicit. Focused domain/planner/integration tests pass (105/105), the production-browser workflow passes (1/1), targeted ESLint passes, and the production build succeeds with the existing 604.18 kB main-chunk warning. Hosted PostgreSQL parity and independent field acceptance remain open. |
| 195 | Skill-aware opportunity capacity signals | Implemented locally | Opportunity forecasts can capture up to 20 required skill labels per trade alongside dated demand and approved qualification requirements. Capacity review compares these exact, normalized labels with worker-declared skills and reports matching profiles/hours by requested workday, separate from total role capacity and certificate readiness. Missing self-declarations make the assessment incomplete; they are not treated as negative proof, and a skill match is explicitly unverified and never substitutes for credentials, availability checks or human selection. Domain/pipeline tests pass (16/16), locale tests pass (5/5), the production-browser opportunity flow passes (1/1), targeted ESLint and production build pass with a 604.89 kB main-chunk warning. A first full Node run had one unrepeatable planner-test failure; the planner file passed alone and the second full run passed 908/955 (47 PostgreSQL-dependent skips, zero failures). Hosted PostgreSQL parity and independent operator acceptance remain open. |
| 196 | Link estimated supervision capacity from pursuit through work planning | Implemented locally | An opportunity may record a distinct supervisor role, an explicit maximum workers-per-supervisor ratio, dated peak crew sizes, supervisor shift hours and catalogue qualification requirements. The bid capacity assessment derives supervisor headcount and hours per day and checks that role against its own current profiles, assignments, availability and required credentials; insufficient supervisor capacity is a visible shortfall. Duplicate overlap with a productive trade role is rejected. On conversion, the normalized forecast is copied to the job with a source hash and planning-only status, and supervisor qualifications become ordinary job requirements. The office work plan displays the estimate while explicitly stating that no task/worker is created or assigned and that statutory ratios and overlapping task windows are not verified. Node tests pass (18/18), supervision UI and Dutch locale tests pass (7/7), the production-browser opportunity-to-job workflow passes (1/1), and repository ESLint passes. The full Node suite passes (910 passed, 47 PostgreSQL-dependent skipped, 0 failed). Build succeeds with a 610.12 kB App chunk (600 kB warning threshold). Hosted PostgreSQL parity and independent operator/field acceptance remain open for this increment. |
| 197 | Reconcile pursuit forecasts with resource plans and stabilize mixed-trade approval | Implemented locally | Feasible work-plan previews compare forecast and planned hours by normalized trade role, identify roles missing from either side, and report supervisory hours plus task-level supervision roles that have not been configured. The comparison is advisory: it does not change tasks or assignments, compare date windows, or verify accepted scope. Forecast changes participate in the plan source hash. Coordination checklist tasks are excluded from field resource planning while real field tasks still require explicit trade scope. Fixed intermittent replacement-review resolution when a multi-trade plan chose a primary assignee whose crew role differed from the task's primary trade; explicit crew-member roles now govern that check. Focused Node suites pass (62/62), mixed-trade approval test passes eight consecutive runs, Dutch locale tests pass (6/6), production-browser opportunity-to-job-to-resource-preview flow passes (1/1), and repository ESLint passes. Production build succeeds with the existing 610.12 kB App chunk warning; hosted PostgreSQL parity, date-window comparison, accepted-scope verification and independent operator/field acceptance remain open. |
| 198 | Review dated resource demand and verify packaged planner dependencies | Implemented locally | Resource previews compare crew and supervisor hours per site-local date, retain unknown forecasts/undated task hours, flag work outside the estimate window, and correctly split overnight/DST work. Named supervisors and incomplete shared supervision are handled explicitly. The expandable review fits desktop and mobile; approval and accepted scope remain separate. Fourteen missing modules were added to Docker/Windows manifests, with a literal dependency-closure release check. The rebuilt Node 22 image passes authenticated/read-only/non-root startup, persistence, recovery, handover and a real solver preview with no ledger mutation. Focused Node tests pass 37/37, UI/locale 8/8, browser flow 1/1 at 1440x1000 and 390x844, lint and release checks pass, and the dependency audit reports zero known vulnerabilities. Build retains a 610.13 kB App warning. Windows binary rebuild, full Phase 198 regression, PostgreSQL parity and independent operator/field acceptance remain open. |
| 199 | Load finance on demand and preserve dynamic Dutch statuses | Implemented locally | Finance is a separate lazy workspace with the canonical request passed from the parent, shared action labels and unchanged approval/download/evidence paths. Browser requests prove the module is absent on Today and fetched once on opening Finance. App is 591,140 bytes (previously 610,125), passing the unchanged 600,000-byte largest-JS limit. Production compaction retains normalized API status labels rather than deleting their Dutch translations. Full component suite passes 259/259 with two workers and unchanged deadlines; focused Node/source/caching tests pass 52/52, four production-browser flows pass across desktop/tablet/mobile, lint and source release contract pass, and the actual Node 22 container passes persistence/recovery/handover/solver checks. Aggregate gzip 676,627/578,500 and Brotli 585,512/540,000 plus five surface budgets still fail; no limit was increased. Full Node regression, Windows artifact refresh, PostgreSQL parity and independent operator/device/field acceptance remain open. |

Phase 197 final full-suite evidence: 958 tests, 911 passed, 47
PostgreSQL-dependent skipped, zero failed. That September 27 result is not a
full regression result for Phase 198. Phase 198 adds dated comparison locally;
accepted scope and real-world workforce commitments remain independently
reviewed.

## Phase 201 production-readiness evidence

Caller-supplied translation fallbacks and English rendering before lazy Dutch
catalog loading now have executed production-compaction regressions. Both
browser servers use the runner's exact Node executable. Nine focused tests,
three built-application browser workflows, lint, build and the source release
contract pass. A central-English-catalog experiment was discarded because it
made the language module larger and initially broke English rendering. Startup
timeouts occurred before a successful retry with unchanged deadlines; they are
not represented as consistently successful first runs. Full final regression
and independent device/operator acceptance remain open.

The final Phase 201 bundle is 676628 gzip bytes and 585449 Brotli bytes; the
unchanged limits are 578500 and 540000. App remains 591140 bytes and passes its
600000-byte limit. The same five surface limits remain exceeded. These failures
still block release. Local HTTP 200 readiness is not hosted production readiness.

## Phase 202 Windows candidate evidence

An actual Node 22.23.2 candidate has been built and verified at
`release/ContractorAI-windows-x64-candidate-20260930-phase202`; the default
package was preserved. Its isolated smoke gate reaches schema
`095_field_reply_notifications`, zero pending migrations, and verifies
authentication/company boundaries, identity restart/backup/restore, signed
company handover and the real packaged resource solver with dated reconciliation
and a read-only preview. Twenty focused Windows/release tests pass without
skips. The builder and verifier now share a guarded candidate-directory setting.
The ngrok edge remains a test double. No distribution was promoted, published or
signed; full final regression, bundle gates and live operational acceptance
remain open. This closes the missing candidate-build evidence, not the overall
production-readiness objective.

## Phase 203 build-isolation evidence

Windows packaging now stages its web build privately and compresses the
configured output, preserving the served checkout `dist`. A real candidate build
was observed through 276 successful unchanged shell/entry requests; all 191
canonical files retained hashes, sizes and modification times. All 94 candidate
JS/CSS assets passed Brotli decoding and no new staging directories remained.
The actual candidate smoke passes schema 095, company/identity/recovery/handover
and the packaged read-only resource solver. Twenty-nine focused tests pass without
skips, including successful/failed staging lifecycle cleanup. Ordinary development
builds are not isolated, and replacing an actively running package is not an
atomic deployment. Bundle limits, full final regression and external acceptance
remain release blockers; no release was promoted or published.

## Phase 204 browser-audit evidence

Automatic browser groups now select exact file/title identities and enforce
exactly-once collection and execution. Audit mode retains every group's evidence
without treating a failure as success. The original line-based audit had missing
coverage and is not accepted as a full run. Its stable replacement executes all
150 cases across 38 groups with valid coverage: 147 pass and three fail.

The resulting fixes distinguish encrypted conversation storage from shell-cache
readiness, preserve edited Last Planner dates through delayed reads, and prevent
stale recovery reads from enabling follow-up commands. Server source/version
checks remain intact. Failed refreshes remove stale actions while preserving
resolution drafts. Mobile dossier scrolling and two contrast defects are repaired;
fixture isolation and required-trade evidence are stronger.

An initial 18-case recheck passes, but repeating eight cases in their original
groups exposes one overlapping child-cost write. A shared recovery write lock
now blocks closure throughout mutations and refreshes and clears stale success
notices. The next recheck passes all 26 attempts across seven groups (22 unique
cases), including both original failed groups, with valid coverage throughout.

A subsequent component run fails one uncertain-photo remount case (266/267).
A deterministic regression independently reproduces draft loss when navigation
precedes passive autosave effects. Draft hydration and flush registration now
run in the layout phase; the regression fails before and passes after the fix.
Three additional browser cases pass after rebuilding this final change: partial
delivery, offline client conversation and operator draft recovery.

The complete local Node run passes 942 tests with 48 skips; those skips are not
fresh hosted-database proof. The final component run passes 268 tests in 54 files;
14 runner/cache tests pass without skips. Lint, build and source contracts pass.
Focused post-fix browser evidence must be distinguished from a single green final
full-suite run. The latest unchanged bundle gate still fails: gzip 677051/578500,
Brotli 585777/540000 and six surface limits. Largest JS passes at 591140/600000.
No release, managed-provider acceptance or deployment is claimed.

## Phase 205 packaging and forecast evidence

Edited cash-flow date and opening-cash inputs now survive delayed refreshes.
Superseded reads cannot publish their result; a forecast cannot be submitted
for approval while its displayed inputs differ from the operator's inputs.
Four regressions fail before the fix; the five final regressions plus the two
existing finance tests pass 7/7. Full local Node regression passes 951 tests
with 48 environment skips and no failures; skips are not current hosted proof.

The unchanged bundle limits now gate private Windows builds before target
replacement and Docker builds before runtime-image creation. Reports bind
source and Brotli bytes with hashes; missing product surfaces and invalid
compressed assets fail. Windows package verification recomputes the evidence.
A real rejected Windows build preserves the previous target, default package
manifest and all 191 canonical web-output files, including hashes and times.
The actual Docker attempt cannot list builder workers (transport HTTP 500),
so Docker gate execution is unverified. No shared daemon was restarted.

An attempted catalog deduplication increased download sizes and was reverted.
Bundle size, current final regression and external production acceptance
remain release gates. All 273 component tests pass across 55 files. The broad
audit executes all 150 browser cases once with valid coverage: 149 pass and
the cash-flow race fails on the frozen Phase 204 build. The corrected web build
passes. A first targeted round passes the original four cases but exposes a
table-date contrast failure in the adjacent finance check. Darker secondary table
text fixes that issue; the next rebuilt five-case recheck passes with valid
coverage and no accessibility exclusions, including cash-flow approval/archive,
bilingual costing, desktop 1440x1000 and mobile 390x844. Its final bundle gate
still fails at gzip 677340/578500, Brotli 586177/540000 and six surface limits.
A targeted green recheck cannot erase a failed broad audit. Lint, source contract
and dependency audit pass; there is no new package, deployment or live-provider
acceptance.

## Phase 206 build and delivery evidence

Named Lucide imports now resolve through the installed package's real export
map, preserving aliases and leaving namespace/non-icon APIs untouched. The
measured build graph drops from 1740 to 252 transformed modules. One private
comparison measures 17.67 versus 14.85 seconds; ordinary builds are 15.42 and
18.75 seconds under differing load/cache conditions. This is not a universal
performance guarantee or a download-budget fix.
The final gate remains red: gzip 677516/578500, Brotli 586030/540000 and six
surface limits. Largest JS remains within its limit at 591427/600000.

Forty-nine focused Node checks and all 273 component tests pass; the Phase 205
full Node run remains historical, not a new full or PostgreSQL run. Eight unique
browser scenarios ultimately pass with valid coverage after correcting a new
test's premature navigation-count assertion. The original four-case group is
rerun 4/4; a final screenshot/interaction check passes 1/1. This does not prove
a full green run of all 151 currently discovered browser cases.
The final helper-export boundary is rerun through the 20 import/catalog/budget
tests. Its rebuild retains exactly the same measured report and hashes for all
94 tested source/Brotli assets.

The real Docker build now reaches and fails the enforced bundle gate, rather
than failing to list workers. No runtime image is accepted. A current Windows
rejection drill again preserves the target, default manifest and all 191 served
files including hashes/times. Both paths report the same current size failures.
Lint/source contract and local readiness pass; no package, provider acceptance
or deployment is promoted. Download size, complete final regression and external
production acceptance remain open.

## Phase 207 interrupted replacement recovery

The replacement form retains uncertain requests in the existing source-scoped
session draft, freezes every editable control while writing or awaiting an
identical retry, and uses a synchronous single-flight guard. Confirmed
rejections unlock correction without losing selections. Closed, cancelled and
stale recovery cases disable child actions. The API replay check binds the
original approval and plan IDs; no new backend or approval contract is invented.

All 280 component tests across 56 files pass. Nine focused Node/API checks and
nine browser scenarios pass, with valid exact-case coverage. A final 1/1 visual
recheck covers desktop 1440x1000, mobile 390x844, a real retained server request
with a deliberately discarded response, identical retry, one pending approval,
unchanged original assignment, and reload confirmation. The expected simulated
network error is isolated; no other console/page errors occur. Accessibility
checks of the recovery surface pass without exclusions.

The complete final Node 22 run passes 957 tests, with zero failures and 48
environment skips (1005 total, 647.70 seconds). This refreshes the local
backend baseline but does not prove PostgreSQL or live-provider acceptance.
The stricter final browser recheck binds the single expected network failure
to the deliberately aborted replacement URL and admits no other error.

A private 587-field shared-control experiment saves only 109 gzip bytes and
adds 80 Brotli bytes relative to Phase 206, so it is discarded without rewriting
the two large screens. Current functional build passes; unchanged budget limits
still reject gzip 677669/578500, Brotli 586174/540000 and six surfaces. This phase
does not promote a Windows package, rebuild an accepted container, deploy,
reset the operator ledger or establish live provider acceptance. The current
152-case browser inventory has not had a full green final run.

## Phase 208 bounded offline documents

The online field pack loads PDF verification and encrypted-vault modules only
when requested. Browser network evidence verifies this boundary, while all
96 generated JS/CSS assets remain in aggregate size accounting. One shared
verifier bounds its byte buffer to the approved size, rejects invalid metadata,
HTTP/MIME, signature, hash, truncation and overflow, and releases stream locks
even on failure. A synchronous offline-save lock rejects overlapping submissions
and freezes the passphrase; failed downloads or changed live sources do not
retain a vault. Existing role/company, source and document limits stay intact.

Full component checks pass 287/287 in 57 files. Focused Node checks pass 43/43
without skips; the entire Node/PostgreSQL/provider suite is not refreshed.
All twelve selected browser identities execute once and pass with valid
coverage. The encrypted folder retains real drawing, SDS and submittal PDFs,
reopens offline, returns exact bytes and synchronizes one question once. Expiry,
company isolation, governed documents, client conversation and operational
recovery remain checked. Desktop/mobile screenshots and exclusion-free offline
axe checks pass. Repository Playwright is used because Browser plugin/skill is
not available; operator data is not reset.

Build, lint, diffcheck and source contract pass (101/12/17/740). This is a
robustness and first-use loading increment, not aggregate size progress:
gzip 678750/578500, Brotli 587323/540000 and five surface limits still fail.
The full 152-case browser inventory has not had a final green run. No package,
accepted container, commit/push, deployment or provider acceptance is promoted;
the production-readiness objective remains incomplete.

## Phase 209 source-bound browser checks

Browser audits now bind the complete served build, packaging runtime closure
(including packaged documents), application sources and exact browser cases.
Before/after checks reject mutation or empty batches; private live state and
unpackaged notes remain outside the fingerprint. Test children inherit only
allowed platform/browser settings, force local loopback storage and disable
external channels. This is not installed-dependency attestation or a network
sandbox. Real runner edits and a packaged-document edit both triggered rejection.

The final broad audit executes 152 cases once: 151 pass and one first-page
attendance assumption fails. The corrected sixteen-case group passes on
byte-identical build/runtime/application sources, while browser-test sources
change. This is not a single green final full-suite run. Explicit locale setup
also fixes an earlier icon-test ordering assumption. All 42 focused Node checks
pass without skips; full Node/PostgreSQL/component checks are not refreshed.
Build, lint, diffcheck and source contract pass (101/12/17/742).

The local development database receives a consistent, integrity-checked SQLite
snapshot before restart; this is not a full encrypted evidence recovery. Local
readiness on port 3002 passes with verified storage and no pending migrations.
All 96 measured asset identities remain unchanged, and gzip 678750/578500,
Brotli 587323/540000 and five surface gates still fail. No package, accepted
container, commit/push, deployment or provider acceptance is promoted.
The total-solution and production-readiness objectives remain incomplete.

## Phase 210 recovery-command safety

Six recovery forms share synchronous write locking and exact uncertain-request
replay. Supplier forms survive temporary parent locks and panel collapse;
actual-cost allocations/corrections survive reload; stock retries recheck edit
rights. A first-load cash-flow guard removes editable defaults and NaN totals
until real data arrives. Nineteen new component regressions bring the final suite
to 306 passing tests in 59 files; 56 focused Node checks pass without skips.

The broad attempt was stopped after reproducing a cash-flow loading failure;
its completed first group passes 15/16. The final source-bound ten-case
recovery/finance selection passes exactly once per case on the repaired source.
This is not a full green run of all 152 cases. Build, full lint, diffcheck and
source contract pass (101/12/17/745). All 97 generated JS/CSS assets remain
counted: gzip 678767/578500 and Brotli 587337/540000 fail along with five surface
limits. Relative to Phase 209, aggregate gzip grows 17 bytes and Brotli 14 bytes;
the safety fixes are not claimed as a size reduction. No thresholds are raised.
Local readiness passes on loopback port 3002; production/package/container,
managed storage, provider acceptance, commit and push remain unperformed.

## Phase 211 takeoff input-type hardening

Takeoff `measurementType` now rejects array and object values instead of
coercing them into accepted scalar modes. The focused takeoff suite passes 9/9,
targeted ESLint and `git diff --check` pass, and the release-contract check is
valid (111 canonical paths, 12 retired paths, 19 hosted environment keys, 811
source files). The fix is published to PR #117 at `c21f4cde`; its refreshed
GitHub checks passed, and the security-hardening PR was merged into `main` at
`8947fe7e18b04bd9bffdb2d59b61f45862c2c0ca`. The exact-head `verify`, Windows
standalone and CodeQL checks passed before merge. A post-merge main-branch scan
is still required to confirm the main-branch alert state.

## Phase 213 post-merge security and release verification

On 2026-10-14, PR #120 merged to `main` at `895cc093099ead12e46304339c89244ca0f77ed9`.
Its exact-head run `38623187739` passed `verify` and `windows-standalone`;
verify included 1,111 and 128 passing tests in separate Node groups, 46/46
browser batches, the production build, container acceptance and bundle budget.
The post-merge CodeQL run `38627734542` passed and the repository API reported
zero open code-scanning alerts. The post-merge main verify run `38627736106`
was still running when recorded, although its Windows package job had passed.

GitHub About metadata, README, security policy, prerelease, vulnerability
alerts, Dependabot updates, private vulnerability reporting, secret scanning,
push protection and protected-main required checks were verified live. Generic
secret-pattern scanning remains disabled/unavailable for the configured account;
validity checks remain disabled. Neither setting is reported as active.

Production deployment is still not accepted. No hosted environment file, SSH
configuration, Hetzner CLI context or deployment secrets were present in the
checked environment. The live EU provider, DPA, HTTPS ingress, PostgreSQL/S3
durability, encrypted recovery, witnessed restore, monitoring and independent
operator/field-device acceptance remain unverified. See the current
`FINAL_VERIFICATION_REPORT.md` checkpoint and `EU_HOSTING.md` before promotion.

## Historical Phase 212 checkpoint (superseded by Phase 213)

On 2026-10-14, the current `main` tree is `8947fe7e18b04bd9bffdb2d59b61f45862c2c0ca`.
The production-bundle verifier was run against a fresh Vite production build
from the current-main-derived documentation branch. It passed with 117 assets,
zero failures, largest JavaScript 370,044/600,000 bytes, largest CSS
245,894/300,000 bytes, complete-product gzip 700,057/725,000 bytes and Brotli
598,930/620,000 bytes. The release-contract verifier passed with 111 canonical
paths, 12 retired paths, 19 hosted environment keys and 812 source files.
These checks correct the older bundle measurements below; those values remain
historical evidence and are not the current bundle gate result.

PR #117's exact-head CI passed release verification, lint, production build,
bundle verification, frontend and Node tests, performance, container smoke,
browser workflows, Windows standalone packaging and CodeQL before its merge.
The local Docker daemon did not respond to `docker version` in a later local
smoke attempt, so no local image/container was created by that attempt. The
successful CI container run is the available container evidence; it is not a
live EU deployment or provider acceptance.

EU-hosted production is still not accepted: an operator must provision and
verify the EU region, DPA, HTTPS ingress, durable PostgreSQL and object storage,
secrets, encrypted backups, restore/recovery objectives, monitoring and
independent operator/device acceptance. Real messaging, accounting, mapping,
calendar, banking, Peppol and remote AI providers remain unconfigured. The
remaining dependency and documentation branches require exact-head CI after
their update to current `main`; local checks or earlier branch runs do not
replace those checks.

## Release interpretation

Phase 200 verifies the covered hosted ledger contracts locally: 896 local
tests and 79 tests in the final PostgreSQL group pass without skips. The
database group was fully rerun after fixing a stale migration-head expectation
and strengthening its latest-schema checks. Unsafe database-test targets are
now rejected before connection, including direct invocation. Mixed-role
resource-plan source checks, replacement approval, dated variance, restart and
unavailability have real PostgreSQL evidence. Live object storage, production
hosting, managed recovery and independent acceptance remain unverified. The
active user objective is now production readiness, not partial feature growth.

Historical September 30 Phase 198: the separate bundle-budget gate failed despite a
successful functional build and source contract. Largest JS is 610,125/600,000
bytes, aggregate gzip 674,681/578,500 and Brotli 583,409/540,000; five surface
limits also failed. These historical thresholds and measurements are superseded
by the current verifier result recorded in Phase 212.

Historical Phase 199 fixes only the largest-JS limit (591,140 bytes). Its
measured aggregate figures were gzip 676,627/578,500 and Brotli 585,512/540,000,
with the same five surface failures. Those historical measurements are
superseded by Phase 212 and do not describe the current release gate.

The local-first product may be released only when the final automated and browser
gates pass. EU-hosted production must remain blocked until phases 069 and 100 and
the external portions of 012, 013, 063, 065, 067, 092, 093, 102, and 115 have
operator-owned evidence. Partial does not mean safe to ignore; it defines the next
bounded improvement or external acceptance step.
