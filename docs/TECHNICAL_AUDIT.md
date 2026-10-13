# Technical Audit

## Current performance update - Phase 244, 2026-10-03

The loading candidate query uses independently counted resource IDs and indexed
EXISTS/NOT EXISTS checks instead of multiplying three child joins. Migration 096
adds covering `(job_id, status, id)` indexes to tools/materials. Existing loading
plan index is reused. Explicit ascending IDs settle previously unspecified ties;
job/status/null-ID/count scope and LIMIT 5 remain. No business/approval/provider
rule or frontend source changes. Head assertions and packaged readiness gates
advance to 096 while historical migration fixtures are retained.

Local production-query/nextActions/migration/parity/cache tests pass 15/15, source
freeze 716 files; lint, whitespace, release contract 107/12/17/851 and npm audit
0/451 pass. Selected Chromium 15/15 revalidates current backend with unchanged
previous dist, candidate f86daf93ec5eb32697b40ec09773c74e1e67e3af267cb798980977c48c88d3cb.
Desktop/mobile screenshots inspected; relevant console, scoped accessibility,
navigation, rapid input, cancellation, search/paging and compressed transport
pass. Initial private SQL prototype gives scoped median 780.68 -> 463.76 ms on
5,003 jobs plus resource rows for 12 existing jobs; index growth 147456 bytes.
It is not a final built-profile or universal latency/RAM claim.

C: disk exhaustion invalidates complete TLS/Node verification. D: exFAT causes
four link-fixture EISDIR failures; the broad repeat and slow benchmark/probe are
stopped, not success evidence. Current full NTFS/PostgreSQL/build/package proof
remains open. All 118 unchanged assets count; seven budgets still fail. PID 27296
and operator records remain untouched; no Git/provider/deployment action. See
the final report and D: `Contractor-AI-QA-phase244-mlNuU6` retained evidence.

## Previous performance update - Phase 243, 2026-10-02

Two product paths change: a build-only loaded-preload-filter plugin and its Vite
configuration entry. Its early generateBundle hook retains the live emitted
graph; the supported Vite resolver removes exact already-loaded JavaScript
references from dynamic preload arrays. Static traversal handles cycles and
never crosses dynamic edges. New/shared children, CSS, assets, unknown paths
and HTML preloads remain. No source module, export, permission, business rule,
provider or backend runtime changes. Custom/disabled policies, debug maps,
alternative minifiers, SSR, libraries and non-ES output bypass filtering.

Because Vite inserts dependency maps after Rollup finalizes names, the plugin
salts affected dynamic-import chunks earlier using policy, Vite version and
serialized implementation identity. Eight new tests cover graph mutations,
cycles, output/watch reset, guards, compiler identity and three real Vite builds.
Changed hashed assets cannot reuse names; child exports/code and all CSS stay
unchanged. The initial unsalted private probe is not shipped. Its 380 omitted
references across 86 callbacks are not evidence of 380 extra network downloads.

Current focused canonical Node 132/132 across 17 files passes without failures
or skips. Fresh full components 528/528 across 85 files pass with two workers
in 159.00 seconds. Current Chromium 44/44 across 18 files passes in one isolated batch,
3.9 minutes; candidate c9aada9924b653e61e9d5b872ea41c1d30dc566406ff18001c17fb0f2f2783a9
is revalidated. All 84 runtime and 164 browser-closure hashes equal Phase 242;
root/component count is 226. Navigation/typing, delayed/failed forms, exact
translations, private previews/originals, client/field/company offline flows,
recovery, qualifications and accessibility retain behavior. Discovery 181 is
not complete 181-case execution or live provider/device acceptance.

Build 23.86 seconds. All 118 assets count: gzip 700819/Brotli 599521, -533/-430
versus 242; largest JS 370088/CSS 245894. Every CSS body remains unchanged,
sidecars round-trip, and seven original gates still fail without limit changes.
This is modest loader/transfer progress, not a universal latency or RAM claim.
Full lint, source contract 107/12/17/848, whitespace and fresh audit 0/451 pass.
Inspected desktop 1280x720 and mobile 390x844 dashboard captures show no overlap;
page identity/nonblank/overlay/console and actual navigation checks pass.
Seven public identity-only GETs match current dist on port 3002. PID 27296 and
operator records remain untouched. No Git/provider/deployment action occurs.
The production goal stays active; full browser/device/RAM/load, size, older
backend restart and package/EU/provider/operator acceptance remain open.

## Previous performance update - Phase 242, 2026-10-02

Only the operating ledger changes in product code. Its scope descriptor marks
the one-to-many request join for DISTINCT; four active/capability count branches
use ordinary COUNT(records.id) elsewhere. Using the ID, rather than COUNT(*),
preserves skipped null IDs in legacy SQLite data. Terminal/null-status projects,
orphan/global records, type/status/credential filters, parameter ordering, sums,
cache invalidation, approval and authorization remain unchanged. No migration,
provider, dependency or frontend module is added.

Four adversarial in-memory SQLite tests and a real PostgreSQL contract compare
the new queries against their former DISTINCT form. Full canonical Node passes
1,188/1,188 across 260 files, including verified-TLS PostgreSQL 16, with zero
failures/skips. The final run freezes and rechecks 711 source/fixture files.
The first broad run exposed eight stale dashboard source assertions and two
clock-dependent equipment fixtures. Assertions now include the actual deferred
form modules, without removing safeguards; custody tests use an explicit past
checkout and a future return window, without loosening product validation.
All 64 targeted regressions and the subsequent complete run pass.

Controlled same-fixture AB/BA measurements reduce recalculation median 18.99%:
567.49 -> 459.74 ms across 20 samples each, with equal summaries except generated
timestamps. Independent fresh-profile cold p95 is 594.76 ms versus the earlier
509.13 ms, so no general latency improvement is inferred from those separate
runs. Every original benchmark threshold passes; see PERFORMANCE_BENCHMARK.md.

Current selected Chromium 38/38 across 13 files passes, including navigation,
typing, intake, audit, archive/restore, automation, recovery and accessibility.
Candidate 55fcf3524f44b6df02887919113446b1408f5c95a549ef38b7ff1125f92fba05
is revalidated; all 239 built-file hashes equal Phase 241. Each source inventory
changes only operating-ledger.js. The previous full 528-component suite was not
rerun; React/style sources and served frontend bytes are unchanged. Discovery
181 remains distinct from a complete current browser run.

All 118 assets remain 701352 gzip/599951 Brotli; seven original gates still fail.
The private fallback-dictionary probe worsened totals by 4712 gzip/3214 Brotli
bytes and was rejected. Brotli mode/size-hint/window probes on eight large assets
saved zero bytes and were not shipped. Full lint, source contract 107/12/17/846,
whitespace and fresh dependency audit 0/451 pass. Operator PID 27296 was not
restarted; this backend change requires a restart before operator use. No
operator business writes, Git publication or provider/deployment actions occur.
Full browser/device/RAM/load and package/EU/provider/operator gates remain open.

## Previous performance update - Phase 241, 2026-10-02

Qualification workers now use the existing 10/25/50 paging controls, defaulting
to 25 visible records. Their exact former JSON search projection and the
availability projection are built once per source array while active search is
mounted, using the existing resource-search hook. Clearing search or leaving
the view releases the index. Fallback worker rows and requirement job lookups
reuse unchanged arrays. Default React row memoization includes the current row,
translator, permission flags, submitting state and callbacks; no custom equality
can hide a changed credential or approval. The default 500-worker API cap and
unpaged job requirements are unchanged, not presented as unlimited pagination.

The real built UI's read-only 500-worker fixture types 46 sequential characters:
search reads rise 0 -> 500 once, while approved-row reads remain 25 -> 25.
Every loaded identity remains reachable; worker 500 opens its exact evidence
editor and cancels. Business commands are zero; the two requested English/Dutch
preference PATCHes are checked separately, with no preference write while typing.
Unit cases also exercise 45-character qualification/availability input, former
serialization, fresh/fallback records, callbacks, rights, locale, busy state,
page resets and shrink/expand/empty behavior.

Full components 528/528 over 85 files and focused Node 122/122 over 16 pass.
Current selected Chromium 29/29 over ten files passes with candidate revalidation;
discovery 181 does not imply complete execution. Existing real-ledger qualification
and three availability cancellation/replacement/unknown-return workflows pass.
Inspected desktop worker/footer and mobile toolbar/footer captures show no overlap;
scoped axe/containment pass. A reproduced credential-label contrast defect is
corrected with one qualification-scoped CSS rule. A test's stale English selector
after switching to Dutch was corrected without changing product behavior.

All 118 assets count: gzip 701352/Brotli 599951 (+195/+5 versus 240), largest
JS 371814/CSS 245894; sidecars round-trip. Only App CSS changes, all 84 runtime
hashes remain equal, and no limits are relaxed. Four-rule exact CSS deduplication
was rejected after built CSS gzip -15 bytes/Brotli +25 bytes in the standalone
probe; no new CSS optimizer ships. Seven original size gates still fail.
Full lint, source contract 107/12/17/845, whitespace and fresh audit 0/451 pass.
No whole-browser RAM/latency, independent-device, full backend/load or production
acceptance is inferred. Operator process/records and Git remote are unchanged;
the production goal remains active.

## Previous performance update - Phase 240, 2026-10-02

The loaded client directory previously rendered all matching records and rebuilt
field comparisons per input event. The reproduced 500-client mount reads 500 row
metrics; the bounded view renders and reads 25 initially, 95% fewer initial
articles. Active search builds its eight per-field values once per loaded array,
not on every character. Exact case-insensitive field boundaries remain intact;
the mounted index is dropped when search clears. Default React row memoization
receives record identity, locale, authority, busy state and callbacks explicitly.
Fresh records and props remain live. The API's existing500 loading cap is unchanged.

Final components519/519 across84 files and selected Node122/122 across16 files
pass. Current Chromium24/24 checks pass on the exact candidate; discovery180
does not imply full180 execution. The 45-character actual input keeps row-metric
reads25/25 and business commands0; the explicit language preference PATCH is
separately checked, not mistaken for a client edit. The500th loaded identity is
reachable and opens its exact editor without saving. Shared resource pagination,
existing tab/deferred-code/cancellation paths and primary accessibility also pass.

The new populated-directory axe check reproduced insufficient contrast in four
existing text colors. Those four scoped colors are corrected; desktop/mobile
axe and stable inspected first-view/footer captures pass. A capture during the
mobile-nav transition was replaced by waiting for its actual hidden state.

All118 JS/CSS assets count: gzip701157/Brotli599946, +549/+559 versus239. Only the
JobWorkspaceControls CSS body changes; all84 runtime hashes remain equal. Larger
whole-build locale experiments are rejected, not shipped. Seven original size
gates remain failed. Scoped repeated-work/rendering gains are not whole-browser
RAM, universal latency, independent-device or EU/provider/package acceptance.
No operator records, process, permissions or Git remote were changed. The full
current browser audit and pending backend restart remain open; goal stays active.

## Previous performance update - Phase 239, 2026-10-02

Existing recovery instructions still rebuilt the complete retained source-impact
list per character. A forty-source/forty-character regression grows title and
material-quantity reads from 40 to 1640 each. Case-local useMemo now retains the
original JSX until its source-array reference, material-navigation callback or
current-zone formatter changes. The formatter is scoped to that mounted case
and explicit or detected system zone, not a global cache. Blockers, report
choices, current-source checks, hashes and commands remain independently live.

Full components 514/514, focused Node contracts 121/121 and the complete current
179/179 Chromium identities across 45 isolated groups pass. No missing, duplicate,
unexpected, skipped or interrupted cases remain. Actual instruction typing of
77 characters keeps title reads 2/2 and makes zero API writes before submission;
the same workflow verifies offline reading, resumption and source-current closure.
New recovery desktop/mobile captures are inspected. All 84 runtime hashes and
all CSS bodies match Phase 238; no new complete backend/PostgreSQL/load run.

All 117 assets remain counted: gzip 700608/Brotli 599387, +58/+8 bytes versus
Phase 238. Seven original limits still fail; no size saving, total-RAM or
independent device/load claim is made. Current full-browser coverage is resolved,
but package/EU/provider/operator acceptance and the pending backend restart are
not. No operator business records, server process, permissions or Git remote
were changed. The production goal remains active.

## Previous performance update - Phase 238, 2026-10-02

Two customer-input bottlenecks are reproduced, not inferred. Forty delivery
photos incur 1560 label reads after 38 characters, rather than retaining the
initial 40. Sixty-one ordinary input events also perform 61 synchronous draft
writes, each invoking the storage inventory path. Shared `ClientDeliveryPhotos`
uses React's default shallow memoization per mounted instance; its immutable
photo-list reference, private conversation path, token and language all remain
invalidation inputs. It preserves the old div/photo/key/label structure without
introducing provider or business-data caching. The list, viewer and its original
private request/queue/visibility helpers share one counted viewer chunk; office
and customer delivery controls remain separate.

Ordinary response fields now update React state and the existing coordinated
draft hook. Its 180 ms quiet interval and synchronous pagehide flush retain the
latest committed fields. Send attempts, photo hashes/receipts, exact uncertain
retries and final removal still use the existing immediate persistence function.
After correction, photo reads stay 40, input makes zero storage reads/writes,
pagehide writes one exact draft and automatic storage runs once at 180 ms.

Full components 511/511 and focused Node contracts 121/121 pass. Current selected
Chromium checks pass 20/20, including real approved customer access, 56 typed
characters with photo-label reads 1/1, zero input API writes, reload recovery and
actual photo/response/independent-review workflow. Current customer desktop/mobile
captures are inspected; CSS bodies are unchanged. This is not a new complete
179-case audit, whole-browser RAM/load or independent device/provider acceptance.

All 117 built assets count: gzip 700550/Brotli 599379, +52/-73 versus Phase 237.
Seven original size limits still fail, including delivery11949/8500. Scoped CPU/
storage work improves; substantial total-transfer savings are not claimed.
No backend/API/migration, role, provider or deployment change is made here.

## Current performance update - Phase 237, 2026-10-02

The dashboard's initial App chunk is the largest startup JavaScript body. Its
42 inline operator action forms now reside in one cached on-demand module;
the retained dossier remains in App. A structured extraction of the existing
dirty source preserves original JSX hashes, conditions and exact parent props.
State, draft recovery, authorization and command handlers remain parent-owned.
The shared loading/error wrapper permits closing before code arrives without a
late form mount; it does not abort the underlying ESM network request. A failed
download stays within the form boundary rather than replacing the workspace.

Final App measurement: 370910 raw / 90642 gzip / 72827 Brotli bytes, versus
495201 / 111371 / 87676 in Phase 236. Those are 25.10% / 18.61% / 16.94%
reductions for that file only, not whole-application latency or RAM savings.
The first action form loads the entire shared module (146196 raw / 27103 gzip /
22472 Brotli); subsequent forms reuse it. All 117 assets still count: aggregate
gzip 700498 and Brotli 599452 grow by 6483 / 7812 bytes. Seven original budgets
still fail. This favors initial loading, not minimum cumulative feature transfer.

Three structural Node tests verify all 42 original templates, bindings and
conditions. Seven component regressions cover cached module identity, exact
decimal input, submission locks, reason validation, late-close and contained
load failure. Full components pass 504/504; focused Node contracts pass 120/120.
Three added browser scenarios exercise a real crew POST, delayed download and
503 download failure; retained finance/resource dialogs remain independently
deferred. The current complete browser outcome is recorded in the verification
report, not inferred from these selected cases.

No runtime business, storage, provider or migration code changes in this phase.
Independent devices/cross-browser/RAM/load and EU/provider/package/operator
acceptance remain open. Historical inventory below retains its original date.

Audit date: 2026-08-09
Starting branch: `main`
Starting revision: `d1a89fbc73be714b6cb05bb7fbf554309c3387ea`

## Executive conclusion

Contractor.AI is a mature local-first contractor operating ledger, not a greenfield
prototype. The canonical product is a Node 22 Express service, a React/Vite client,
SQLite for local operation, PostgreSQL for hosted operation, and local or private
S3-compatible evidence storage. The current audit found 381 declared HTTP routes,
72 append-only migrations, 163 Node test files, 63 browser spec files, and 86
unique literal API path prefixes in the main dashboard, plus dynamic child-component calls.

The prompt's 116 phases are primarily a production-readiness method. The practical
contractor core is already represented: qualification, bid/no-bid, site survey,
takeoff and rate build-up, commercial scope, risk, variations, crew capacity,
Last Planner, daily cycles, 5S, LMRA, installation quality, photo evidence, project
controls, procurement, finance handoffs, handover, feedback, and scorecards.

This pass closes five material control gaps: a durable autonomous-work safety stop,
owner-only privacy-minimized diagnostics, hosted retention-policy enforcement, and
first-run business-identity visibility, plus source-current backup-verified QA
maintenance. It also delivers the portable Windows
runtime, loopback-only ngrok launcher, maintained-parser-compatible read-only HAI connector, compressed and
budgeted production assets, isolated browser runner, phase evidence, and refreshed
dependency lockfile.

The governed framework pass adds the complete 23-family source inventory as a
deterministic checked-in catalog, migration 069, role-scoped APIs, immutable
implementation revisions, backup/export/diagnostic coverage, PostgreSQL parity,
due-review command/HAI integration, and a lazy-loaded searchable Performance
workspace. This is a governed method register, not 671 separate certification or
external-provider engines.

The HAI connector now also has an owner-only local publication lifecycle. It
requires an absolute configured path, atomically replaces the bounded feed,
validates the file after writing, and exposes checksummed status without granting
execution or external-commitment authority.

The ngrok launcher now treats the returned URL as unverified until loopback
health, anonymous public rejection, owner-authenticated public runtime identity,
exact origin, and final verified state all pass. Failed startup and normal shutdown
close the public listener before draining the application.

## Runtime map

| Layer | Canonical implementation | Boundary |
| --- | --- | --- |
| Web UI | `App.jsx`, `ClientPortal.jsx`, `components/` | React renders data returned by APIs; no HTML-string event handlers |
| HTTP API | `server.js` | Authentication, authorization, validation, rate limits, readiness, static production output |
| Domain ledger | `operating-ledger.js` | Transactions, invariants, state changes, audit chain, idempotency |
| Local database | SQLite through the ledger adapter | Default local-first persistence |
| Hosted database | `postgres-sync-database.js`, `postgres-sync-worker.js` | PostgreSQL with TLS and migration locking |
| Evidence | `evidence-storage.js` | Local private files or EU S3-compatible object storage |
| Workers | in-process durable scheduler and leases | Ledger-only drafts/checks; no external commitments |
| Delivery | `Dockerfile`, hosted Compose, CI | Node 22, non-root/read-only container controls |

## Findings and disposition

### Closed in this release

1. Autonomous work lacked a single durable owner stop. Migration 068 adds a
   revisioned, audit-backed control. Scheduled cycles and command application now
   return `automation_suspended` while dry-run diagnosis stays possible.
2. Diagnostics were fragmented and could tempt operators to send raw logs. The
   support bundle exposes version, release id, readiness, migrations, aggregate
   counts, integrity, and control state only. It excludes operational records and
   secrets. `npm run doctor` consumes that contract.
3. Hosted startup required a DPA and backup policy but did not require the chosen
   retention schedule to be identified. Hosted mode now fails closed without
   `CONTRACTOR_AI_RETENTION_POLICY_REFERENCE`.
4. Owner business identity could remain incomplete without a clear first action.
   The Today view now directs the owner to the retained Operations identity form.
5. The broad debug projection was accessible to every authenticated role. It is
   now owner-only.
6. Published dependency advisories in the lockfile were resolved without changing
   the application contract.
7. Concurrent job changes could let stale material, safety, permit, LMRA,
   environmental, expense, or daily-cycle responses overwrite a newer selection.
   Job-scoped sequence guards and native disabled loading controls now close those
   races, including programmatic browser interaction during loading.
8. The previous browser runner reused runtime state between specs. It now discovers
   all 101 tests from the Playwright AST and runs bounded isolated batches against
   separate ports and databases after one production build.
9. The broad framework inventory was documentation-only. Migration 069 and the
   framework workspace now retain every family membership and provide scoped,
   replay-safe, checksum-protected implementation records with due-review triage.
10. Large-ledger behavior had only bounded-query assumptions. A deterministic
    63,500-row benchmark now verifies full historical search and pipeline totals,
    audit integrity, disk/memory use, and p50/p95 startup, read, dashboard, and
    canonical-write thresholds in Node 22 and CI. Profiling also removed irrelevant
    full job-detail assembly from unassigned crew and ineligible handover queues.
11. Accessibility evidence relied on semantic spot checks. A pinned axe browser
    gate now covers sign-in, every primary workspace, representative dialogs,
    mobile navigation, and the client portal at mobile and desktop widths. Shared
    compact-text palettes were corrected wherever the selected WCAG A/AA rules
    identified insufficient contrast.
12. The owner automation stop used browser-native prompt and confirmation surfaces,
    which hid retained decision context and provided weak validation feedback. A
    lazy-loaded, focus-trapped decision dialog now retains the reason, requires an
    explicit acknowledgement, restores initiating focus, and is covered across
    API blocking, axe, keyboard, desktop, and mobile behavior.
13. QA cleanup used the final browser-native confirmation and built its archive set
    through bounded list methods, allowing eligible records beyond the list limit
    to remain active. Operations now obtains a complete deterministic preview,
    requires a source-current plan hash and retained reason, independently verifies
    the recovery package, and performs approval rejection plus archive/retirement
    in one transaction. Empty and changed plans fail without partial mutation.
14. Request-body actor labels were replaced at the parser boundary, but explicit
    route fallbacks still read the bound body field and cloned bodies could lose
    its non-enumerable value. All 164 explicit mutation sites now consume the
    canonical trusted request principal directly, and a release source guard plus
    API persistence tests prevent body-derived audit identities from returning.
15. An archived-work-permit regression used a 500 ms live expiry window and a
    600 ms sleep, which failed under full-suite load before approval could finish.
    Permit creation, readiness, and approval expiry now use the ledger's injectable
    clock consistently, preserving strict expiry rejection with deterministic tests.
16. Several governed records still preferred submitted `createdBy`, `submittedBy`,
    `completedBy`, `releasedBy`, or `reviewedBy` labels over the trusted caller.
    Those records now retain the canonical operator principal, the release scanner
    rejects submitted-first operational provenance, and NCR closure separately
    retains its named verifier plus a source-hashed authenticated verifier principal
    that cannot approve its own closure.
17. Finance readiness exposed English-only job-costing and cost-to-complete evidence
    in an otherwise bilingual practical core. Controlled metrics, statuses, actions,
    cost-code tables, source-review warnings, history, policy text, and accessible
    labels now follow the retained operator locale. Structured warning counts and
    billing milestone sequence data remove presentation parsing, while operator-entered
    budget, time, expense, and supplier evidence remains verbatim. The scrollable
    cost table is keyboard focusable and compact summary contrast now passes axe.
18. Tender comparison and approved purchasing remained English-only inside the
    bilingual operator shell. Bid-package search, filters, comparison, preferred
    selection, purchasing commitments, immutable purchase-order packages, and
    verified provider receipts now follow the retained operator locale without
    translating retained names, scope, rationale, or evidence. The end-to-end Dutch
    flow proves approval and provider-receipt boundaries, reload persistence,
    English round trip, mobile containment, and axe-clean procurement contrast.
19. Parent owner-administration surfaces remained English-only and three form
    patterns were invalid under current Chromium Unicode-set rules. Business
    onboarding/identity, managed team access, autonomous safety, and QA archive
    maintenance now follow the retained locale without changing canonical roles,
    statuses, reasons, confirmation phrases, organization evidence, or access-key
    secrecy. The production-browser journey also closed three metadata/step-label
    contrast defects and proves exact API evidence through an English round trip.

### Residual technical debt

1. `operating-ledger.js`, `server.js`, and `App.jsx` remain large modules. They are
   stable but expensive to review. Split by domain only with contract tests around
   every extracted boundary; a speculative rewrite would increase release risk.
2. The UI has broad browser coverage and a dedicated component-unit gate, but the
   focused component inventory should grow as large domain components are split.
3. Forms have validation, idempotency, bounded central draft recovery, and field
   offline queues, but component-internal recovery is not universal. Offline
   queues remain intentionally narrower and explicit.
4. Pagination and advanced filters are not uniform across all long-lived lists.
   The workforce availability conflict register now exposes a completeness flag
   when its 250-row view is capped; bulk replacement is disabled until the full
   conflict list is available, while individual changes remain server-validated.
5. Per-principal operator language and token-scoped client-portal language are
   retained in the ledger. The shell, client portal, Performance Scorecard, and
   Framework Register are bilingual and formatting follows the selected locale.
   Owner onboarding/identity, managed team access, autonomous safety, QA archive
   maintenance, workforce directory, qualification evidence, availability,
   governed work permits, job setup coverage, critical-path work planning, NCR,
   field risk, field assurance, tender comparison, purchasing, job-costing,
   cost-code review, cost-to-complete, and finance-readiness controls are also
   bilingual, but remaining specialist operator workspace copy is not yet fully
   translated.
6. Legal retention periods and data-subject erasure decisions remain operator and
   counsel responsibilities. The application archives and exports; it does not
   silently delete immutable commercial or audit evidence.

## External blockers

- Real email, calendar, mapping, accounting, Peppol, banking, and AI provider
  execution needs separately verified credentials, contractual authority, and
  provider-specific acceptance tests. No fallback credential or fake delivery is
  enabled.
- EU production requires an operator-selected provider and region, signed DPA,
  HTTPS ingress, managed PostgreSQL, private EU object storage, backup/PITR,
  retention policy, and a completed recovery exercise.
- Regulatory and standards references are workflow aids, not legal certification.
  Wkb, AVG/GDPR, tax, safety, energy, and contract compliance require qualified
  human review for the concrete organization and project.

## 2026-09-27 - Local Vite origin must match the API allowlist

Direct local-browser inspection confirmed that the dashboard served by Vite at
`http://127.0.0.1:34123` could load ledger data, but a browser-originated local
preference mutation received `403 local_origin_forbidden`. The default local
allowlist now includes this exact origin (and its `localhost` equivalent).
Other loopback ports remain rejected unless explicitly listed in
`CORS_ORIGINS`; no arbitrary-port wildcard was added. Regression coverage
confirms port 34123 is accepted while an unlisted loopback port remains rejected.
September 30 follow-up: the listener on port 3001 runs another project's
`server/index.ts`, not this repository's runtime; it must not be restarted as
Contractor.AI. The canonical local API and built React dashboard were started
on the free loopback port 3002 using Node 22.23.2. HTTP shell and readiness
checks passed. The separate Vite process launch was rejected by the execution
policy; the built dashboard is available directly from the API instead.

This finding is separate from the isolated production-browser tests, which use
matching frontend/API test origins and pass. Hosted `CORS_ORIGINS` must continue
to be an explicit public HTTPS allowlist.

## Architecture decision

Keep one runtime and one ledger contract. Preserve SQLite for local work and use
PostgreSQL plus private EU object storage for production. Keep external side effects
approval-gated and provider-verified. Expand domain capability behind the existing
API and audit boundaries instead of reintroducing mock dashboards, duplicate
databases, or unrestricted autonomous send paths.

## 2026-09-30 - Packaged runtime dependency closure

Both explicit deployment manifests omitted fourteen required source modules,
including the resource solver worker, worker recurrence, company scoping,
shared material stock, supplier performance and field safety projections.
The Dockerfile and Windows builder now include these files. The release gate
parses literal relative CommonJS imports and supported literal worker paths
without executing source, and checks their transitive closure against each
manifest. Computed imports and arbitrary runtime asset paths are not covered
by this source inventory; actual runtime checks remain necessary.

The rebuilt production image passed its startup/authentication, SQLite-volume
restart, identity recovery, handover and new solver-backed resource-preview
checks, with a read-only filesystem, non-root user and no network for the
isolated planning fixture. The preview also verifies dated forecast comparison
and absence of ledger mutation. The Windows manifest is verified, but its
binary artifact has not been rebuilt for this increment.

`brace-expansion` was updated narrowly from 5.0.9 to 5.0.12 in the lockfile.
The local dependency audit reports zero known vulnerabilities. The development
host runs Node 25; the supported local server and tested container run Node 22.
The 610.13 kB App chunk still exceeds the 600 kB build warning threshold.

The separate bundle-budget release gate fails, not merely warns: largest JS
610,125/600,000 bytes, aggregate gzip 674,681/578,500 and Brotli
583,409/540,000. Five individual surface gzip limits also fail (field context,
client delivery, recovery case, replacement plan and recovery actions).
Functional build/source-contract success does not clear these release limits.
Budgets were not raised. Payload reduction and rerunning this gate remain
required before a release claim.

## 2026-09-30 - Finance workspace loading and dynamic status translations

The finance workspace is now a separate React lazy entry, with its original
API boundary passed explicitly from the parent. The CashFlow control remains
nested and lazy. Finance actions, evidence download company assertions,
approval gates and retained source text are preserved. The production browser
test verifies that no FinanceWorkspace JS request occurs on the initial Today
screen and exactly one occurs when Finance is opened.

The App chunk decreased from 610,125 to 591,140 bytes; the 600,000-byte
individual JS limit now passes. This is initial-route deferral, not an aggregate
payload reduction. All-built-assets gzip is 676,627/578,500 bytes and Brotli is
585,512/540,000; the five surface limits still fail. No limit was increased.

The production translation compactor previously discarded labels derived from
API statuses such as `cost_review_required`, because the English spaced label
was not a literal translator argument. It now retains matching normalized
underscore status literals and object keys. A regression executes the compacted
fixture dictionary; the production browser verifies Dutch cost-review status
and English/Dutch switching without changing evidence. Runtime/generated labels
not represented by these known source forms still require coverage.

Full component tests were also oversubscribing the machine while Docker built.
Vitest now caps its worker count at two, without raising timeouts or reducing
assertions. One stale standby-policy text selector was aligned with the current
copy, with additional assertions for three sequential offers and separate
acceptance/approval. The final rerun outcome is recorded in the worklog.

## 2026-09-30 - Disposable PostgreSQL targets and resource-plan parity

The database contract suite previously trusted any
`CONTRACTOR_AI_POSTGRES_TEST_URL`, including tests that drop the public schema.
A shared guard now rejects non-loopback hosts, non-test database names,
host/database query overrides, fragments and ambiguous repeated TLS parameters
before any connection. Both the Node runner and all fourteen database
integration files use it, so invoking a test directly cannot bypass the check.
Rejection messages omit the URL and credentials. CI uses
`contractor_ai_test_ci`, retaining its verified-TLS configuration. The guard
does not make a test-named database safe to reuse: use a dedicated disposable
server with no business records.

A real, isolated PostgreSQL 17 contract now covers mixed-trade resource
replacement, dated forecast reconciliation, read-only previews, replay,
stale-source approval rollback, independent approval, complete crew persistence
across restart and unavailable retained crew detection. A stale pending
proposal must be explicitly rejected before another proposal enters the queue;
the test retains that existing safety boundary. No worker is silently replaced
and the audit chain remains valid. The connection authenticates the generated
test certificate and hostname. This is local PostgreSQL adapter evidence, not
live object-storage, EU deployment or operational acceptance evidence. Full
regression results and cleanup are recorded in the worklog.

## 2026-10-02 - Runtime cache and early database-test cleanup

The production React chunk formerly imported CommonJS interop from the changing
entry, creating a circular chunk relation and avoidable cache invalidation.
Interop now belongs to React. A two-build regression changes a lazy screen and
verifies identical React bytes and filename, changed screen identity and no
runtime-to-entry import. Full production builds no longer emit that cycle.
Aggregate bundle limits remain red; see the current verification report.

Nine PostgreSQL test setups asserted verified TLS before registering cleanup.
A real plaintext fixture failed that assertion and left an admin socket open,
preventing the failed test process from terminating. They now share connection
verification that closes on an early connection/TLS failure and preserves the
original error. Five unit cases and an actual plaintext child-process rejection
cover that path; successful connections retain their normal owner teardown.
Verified TLS, disposable-target restrictions and production behavior are not
weakened. Full stage outcomes are in the worklog.

## 2026-10-02 - Bounded private photo processing

Phase 227 reproduces the former upload gap: a valid-signature PNG header declaring
400 megapixels was accepted with HTTP 201. The same real API request now returns
415 `image_dimensions_exceeded`, without a new message or stored file. The shared
upload boundary uses Sharp 0.35.5 to decode JPEG/PNG/WebP, reject malformed or
truncated content, check the actual format, and enforce 64 million pixels and
16384 pixels per edge. PDF/DOCX validation is unchanged. Signature-only test
fixtures on these upload paths were replaced by valid images; security and
ownership assertions were retained.

`image-processor.js` serializes native conversion, admits at most four distinct
jobs with 32 MiB total encoded inputs, and caps its preview cache at 8 MiB,
64 entries and five minutes. Identical simultaneous inputs share one conversion.
Libvips uses one processing thread and an 8 MiB operation cache; this is not a
total process-RAM guarantee. Each preview is a static, oriented WebP with at most
960 pixels per edge and 512 KiB, without copied EXIF/ICC metadata. Animated inputs
retain their originals but render only the first frame; APNG is specifically
tested because input metadata does not expose its frame count.

Private conversation `/photo` retains its original-byte contract. Only
`?preview=1` requests a smaller preview. Both paths check authorization, retained
ownership and the original checksum; preview generation rechecks the source and
access after asynchronous conversion. Responses are `no-store` and `nosniff`.
Tampering after warming the cache still returns 409, revoked portal tokens return
404, and field/anonymous/wrong-job reads remain denied. No public evidence URL or
new stored derivative was introduced.

Browser reads use at most two active body downloads and 64 queued requests.
Explicit original downloads precede queued previews. Queued/unmounted reads are
cancelled; only the specific transient processor-busy response receives two
bounded retries. Access failures are not retried automatically. An unavailable
preview does not hide the explicit original-download action. Blob URLs are
released on cleanup; download URLs are released shortly after use.

Native conversion and shared API checks pass on Windows Node 22.23.2. The same
12 image-service tests also pass with an isolated Linux-musl production dependency
install on Node 22.23.3 under a 512 MiB/one-CPU container limit. That is adapter
portability evidence, not acceptance of the complete release image or worst-case
64-megapixel process memory. Official implementation references:
[Sharp constructor limits](https://sharp.pixelplumbing.com/api-constructor/),
[resize](https://sharp.pixelplumbing.com/api-resize/) and
[platform installation](https://sharp.pixelplumbing.com/install/).

## Remaining photo and form resource work

Phase 229 replaces one-shot visibility with shared admission of at most eight
preview leases per document. Offscreen previews are aborted/revoked/removed and
reentry is reauthorized; fixed frames and original-download intent are preserved.
Without the observer API, eight leases and manual selection remain available,
but geometric offscreen release is not promised. Actual browser/OS RAM, caches,
downloaded/opened copies, offline vaults and other product surfaces are not covered
by that lease bound. Real phone-memory, hostile-input load and worst-case pixel-
limit measurements remain open. Synthetic measurements are not device acceptance
or a universal latency guarantee. Aggregate bundle gates remain enforced.

The first complete Phase 227 component run also caught worker-profile skills being
overwritten immediately after a fast edit. `WorkBoard.jsx` no longer copies server
profile values through delayed initialization effects: local edits are scoped to
the account and their exact source values. The first browser selection also
exposed an undefined locale when selecting a shared photo in the office delivery
form. The component now defines its default language, with three regressions for
selected photos and NL/EN publication/response history. The final complete run
passes all 464 component tests across 76 files; approval/admission and API behavior
are unchanged.

## 2026-10-02 - On-demand finance and resource forms

Phase 228 moves only the existing finance/resource dialog JSX to two independently
cached modules. Original field/constraint/callback AST fingerprints are unchanged;
state, draft recovery, calculations and approval handlers remain in `App.jsx`.
Loading remains cancellable, and a dialog error boundary prevents a rejected
module download from replacing the dashboard. Merely loading Today or Finance
does not download either form. Two financial openings use one module request,
and typing does not create ledger writes. Explicit budget submission retains
1500.25/1600.75 exactly and remains pending approval.

The new scoped axe check found an existing 3.77:1 contrast failure in the small
field-record context caption. Its shared text color is repaired without removing
the accessibility assertion. Final desktop 1280x720/mobile 390x844 screenshots
are visually checked; pending/failed code requests, mobile navigation, current
finance/resource workflows and draft recovery pass in the same selected run.

The App chunk drops from 519316 to 496039 raw bytes, 114871 to 111438 gzip and
91931 to 89635 Brotli. This is a startup improvement, not an aggregate reduction:
all 115 assets still total 693545 gzip/603599 Brotli, up 2635/3115 from Phase 227.
All seven existing bundle failures remain release blockers. A local build-time
dictionary experiment also showed that a prefix trie was larger compressed than
the existing retained translation object; no trie or unverified codec was added.
Real device/paint latency, global long-timeline photo memory, the pending API
restart and full current backend/browser/hosted acceptance remain open.

## 2026-10-02 - Bounded conversation preview lifetime

Phase 229 adds document-shared admission of at most eight preview leases. It
releases excluded leases before starting replacements, including pending reads.
Offscreen images lose their object URLs and mounted image elements; the reserved
frame remains. Late completion checks both abort status and request identity.
Reentry is a new authorized read, not reuse of cached client evidence. Explicit
original downloads are independent of preview visibility. Timeline unmount
coalesces reconciliation so removing siblings does not start unnecessary reads.

Without IntersectionObserver, automatic admission still stops at eight. A real
mobile icon-button interaction selects a waiting twelfth photo and replaces a
lease without raising the cap. That fallback does not promise geometric release.
The observed normal viewport peaks at three URLs across twelve visited images;
the real API denies reentry after token revocation. The separate 12MP fixture
renders 2994 preview bytes instead of automatically reading its 1639442-byte
original. Only an explicit action downloads the unchanged original. These are
synthetic resource observations, not measurements of actual browser/phone RAM.

All 478 component tests, 82 focused Node tests and ten selected browser workflows
pass. Final desktop/mobile screenshots and fallback state are inspected. The
build passes, but all 115 JS/CSS assets total 694028 gzip/603995 Brotli bytes,
up 483/396 from Phase 228. Seven existing bundle gates, whole-browser RAM/load,
complete current backend/browser/hosted acceptance and the pending API restart
remain open. No backend source, operator data, approval policy or provider changed.

## 2026-10-02 - Preconstruction search CPU work

Phase 230 memoizes stage/status-eligible records independently of query changes,
then creates exact lowercased JSON search text only while a nonblank search is
active. Query edits use those strings rather than reserializing nested dossiers.
Changed source arrays/filters rebuild the index; clearing search or hiding the
opportunity view drops retained strings. Original source objects and order are
preserved, including case/space normalization and hidden nested-field matching.
There is no global/persistent search cache or cached approval/safety decision.

The initial fixtures reproduce 5050 opportunity and 5000 bid-package serializations
where 50 suffice. Seven search regressions now pass; all 485 component tests pass.
A real local-ledger browser fixture indexes eight opportunities and six packages
once across repeated typing/query changes, retains correct selection and produces
zero ledger writes. All 23 selected production-browser workflows pass, with scoped
axe, console and desktop/mobile containment checks. A premature mobile screenshot
is replaced by capture after the drawer is observably hidden, not a timed sleep.

The expanded Node selection also exposes two source-compatibility tests still
looking for three financial labels in the old parent after Phase 228 extraction.
They now inspect the actual dialog module, retaining the original assertions and
adding a parent draft-wiring check. Exact JSX fingerprint tests remain enabled.
All 99 selected Node tests pass; this is not a complete 254-file/PostgreSQL rerun.

Indexing intentionally retains temporary search strings to reduce CPU work, not
to reduce RAM or asset bytes. All 115 assets still total 694138 gzip/604054 Brotli,
up 110/59 from Phase 229; seven unchanged gates remain red. App raw size remains
496039. Full current suites, real device/load, pending API restart, package/EU/
provider/operator acceptance and maximum-performance proof remain open.

## 2026-10-02 - Canonical Node test resource and environment isolation

Phase 231 finds that Node verification inherited every parent setting, including
operator storage, provider credentials, Node preloads and recursive test context.
A benign temporary preload actually executed; inherited test context also caused
the nested runner to skip its fixture. The wrapper now uses an explicit platform
allowlist, local loopback defaults and disabled channels. Only the shared guarded
test PostgreSQL URL and its configured CA survive. An explicit environment snapshot
does not fall back to the parent's database when its own URL is absent.

A trusted preload supplies unique temporary default state storage. Initial
PID-only directories fail for native solver/build threads and later reused Windows
PIDs; real regressions now verify main-process-only setup and unique atomic
directory creation. Native threads retain their fixture's explicit storage.
Legacy restore CLI fixtures explicitly scrub inherited default paths, keeping
the actual product precedence unchanged; v2 now asserts restored state bytes too.

All 255 canonical files pass: 1039 independent checks plus 117 verified-TLS
PostgreSQL checks, zero skips/failures. The local PostgreSQL 16 container is
dedicated/disposable and removed; no business server or unrelated container is
changed. After the complete run, strengthened runner-only context/receipt/cleanup
assertions pass in a final 8/8 verified-TLS round. This is trusted-test environment
hygiene, not a security sandbox or production-hosting/load attestation.

Full lint and the source contract pass (103 required paths, 823 source files).
Fresh hashing preserves the exact Phase 230 UI candidate and all four groups;
frontend/browser tests are previous evidence, not newly executed this phase.
Fresh bundle checks still fail seven limits at 694138 gzip/604054 Brotli bytes.
There is no end-user speed or transfer improvement in this test-only increment.
Complete browser/load/device, pending API restart and production acceptance remain
open; no restart workaround, provider action, package, commit or push is performed.

## 2026-10-02 - Offline compression and actual browser negotiation

Phase 232 measures all 115 JS/CSS files, selecting the smaller Brotli quality-10
or quality-11 representation per asset. Simply increasing quality makes two tiny
assets larger, so the fallback is intentional. Source hashes and gzip remain
exactly unchanged. All sidecars round-trip; total Brotli falls 604054 -> 591842
bytes (12212 saved). Seven unchanged release-budget failures remain.

The more important runtime defect is standard browser encoding order. Express
acceptsEncodings selected gzip first for `gzip, deflate, br, zstd`, skipping the
direct sidecar. Compression middleware then streamed dynamic quality-4 Brotli.
Actual operator App wire size was 108025, not the 87874-byte prebuilt body.
Negotiator 1.0.0 is now a pinned direct dependency and receives its own options
object with server preferences; copying compression's nested 0.6.4 array API
initially failed. Raw-wire tests protect exact sidecar reuse, quality preferences,
disabled Brotli, gzip, deflate, identity and HEAD. Browser Resource Timing and
decoded bodies confirm the corrected path on fresh isolated servers.

All 102 selected Node tests and 19 selected browser workflows pass; full lint,
production build and source contract pass. Desktop/mobile screenshots inspected,
scoped navigation axe checks clean. Discovery is 174 browser cases, not a new
complete audit. Existing operator PID 27296 still needs the previously pending
restart; no workaround, business mutation or provider/deployment action occurred.
No universal render-latency, sustained CPU/load, whole-browser RAM or maximum-
performance claim follows from scoped transfer measurements.

## 2026-10-02 - Client-delivery input work and linear identity matching

Phase 233 finds retained offers, publication/response photos, candidate matching
and conversation photo choices rebuilt on every form-field update. Retained
history and the photo picker now reuse the current render snapshot; selected
scope and visible-photo filtering likewise follow their actual source/selection
dependencies. Source hash, role, language, system time zone, selected photos and disabled/editor
state still invalidate relevant controls. No global or multi-snapshot cache is
introduced; this reduces repeated work, not total-memory usage.

Matching candidates against every retained offer is replaced with one index of
the same four blocking states. Older-page deduplication indexes incoming IDs once
and retains incoming-first ordering and values; no message or backend evidence
is removed. Tests preserve retry, stale-source confirmation, rights loss, photo
selection/cap/locale, source refresh and ignoring an old page after cancellation.
All 491 component checks and 111 selected Node contracts pass. Seven selected
Chromium cases include actual publication, independent review, customer response
photos and withdrawal; getter-only instrumentation proves unchanged history and
photo property reads during real typing without replacing API payloads.

All 115 assets still count. Total gzip grows 208 bytes to 694346 and Brotli grows
112 to 591954; client-delivery gzip is 11857. Seven original budgets remain red.
This is CPU-work progress, not an aggregate-transfer improvement. Full current
browser/load/RAM/device and production acceptance remain open. Public operator
assets match the new build, but the previously pending backend restart is not
performed or bypassed; no operator data or external provider is changed.

## 2026-10-02 - Whole-catalogue fidelity and complete browser verification

Phase 234 reproduces a real inherited-property defect in the translation lookup:
prototype-like unknown keys can return functions/objects and crash interpolation.
Lookup now requires an own catalogue entry; explicit owned labels, ordinary
fallbacks and compact tokens still work. All 4434 referenced entries are compared
with their original texts in both languages, including 8868 outputs from the
actual served minified module, not only a source-level sample.

The first compression experiment sorts compact IDs by Dutch text. Its catalogue
shrinks 904 gzip/974 Brotli bytes, but changed call sites and dependency hashes
grow the complete build by 746/850. It is rejected. The accepted build keeps
original compact-token identities, assigns values by their exact index even when
transforming reordered source, and sorts only pure retained properties by key.
Non-literal evaluation stays in retained order. Final all-115-asset totals are
694105 gzip/591900 Brotli, only 241/54 bytes below Phase 233. Seven original limits
still fail; no transfer exclusion or increased budget is used.

Complete Chromium verification passes all 175 exact identities in 44 isolated
candidate-bound batches. The earlier rejected experiment's audit was explicitly
interrupted after 16 cases and does not count toward this complete proof.
Afterwards one new test adds a closed-drawer assertion because its initial mobile
screenshot caught the menu transition. Its two catalogue/transport cases rerun
successfully; exact comparison confirms unchanged build/runtime/frontend groups
and only that stronger browser assertion differs. Final desktop/mobile captures
are inspected. Node 88/88, full components 491/491, lint and source contracts pass.
This is not a fresh full PostgreSQL, load, whole-browser RAM or real-device run.

Read-only requests confirm the current HTML, entry and catalogue on port 3002.
Operator PID 27296 remains untouched; earlier backend fixes still require the
pending restart. No business records, external providers, deployment, package
promotion or Git publication change. Production and maximum-performance claims
remain unsupported; the worklog binds exact candidates and evidence paths.

## 2026-10-02 - Recovery draft render work and abandoned reads

Phase 235 reproduces repeated recovery-panel work during unrelated new-case
typing: title reads grow 160 -> 2320 and case reads 72 -> 1368. Selection performs
nested identity scans (2500 reads in the initial fixture), and effect cleanup
ignores old results without aborting the underlying browser request.

Current source and case render objects now follow their actual dependencies.
Source selection uses nested type-to-id sets, not collision-prone joined keys.
Rights, sources, job callbacks, system time zone, resolution and synchronous
command locks still update the appropriate view. The date helper accepts an
explicit current render zone; default callers retain their behavior. One shared
read helper aborts effect cleanup. Generation guards still prevent a late read
from unlocking a refresh; writes never receive the read's abort signal.

Six new component regressions and retained recovery tests pass; full component
coverage is 497/497. The final 80-source/40-selection fixture forces a fresh
source array and confirms 160 identity reads, rather than measuring only a memo
hit. Real-ledger Chromium typing retains 8 title reads, 6 case reads and one
response. Closing a held read aborts it; reopening obtains fresh data without
changing three retained cases or creating a recovery write. All 24 selected
browser cases and 106 selected Node contracts pass. Desktop/mobile screenshots,
scoped axe, containment and console checks pass. There is no new complete run
of all 176 discoverable browser cases or all backend/PostgreSQL contracts.

The tradeoff is explicit: current render references remain retained, and all-115-
asset totals grow 298 gzip/337 Brotli bytes to 694403/592237. Recovery's 4569-byte
measurement includes the shared 158-byte read helper; no asset or budget is
hidden or relaxed. Seven original limits remain red. A duplicate-CSS probe
found zero removable exact rules in the already-minified 28 CSS assets, so no
extra plugin or speculative CSS rewrite was kept.

Lint and source contracts pass; public assets on port 3002 match the build.
Operator PID 27296, business records and providers remain untouched; earlier
backend repairs still require the pending restart. This is bounded CPU/read
progress, not reduced whole-browser RAM, universal speed, hosted load, device
acceptance or production completion.

## 2026-10-02 - Late preload minification and cache policy

Phase 236 inspects actual Vite6.4.3 output generation: its dependency-loading
helper is inserted after ordinary renderChunk minification. A build-only second
pass considers dynamic-import ESM chunks with that helper, retaining code only
when raw/gzip shrink and the minimum quality-10/11 Brotli body does not grow.
Exact import paths, named exports, metadata and final filenames are retained.
The policy contributes to chunk hashing before filenames are finalized.

A real missing-encoder cache regression fails first (8/9 passing); Node, zlib
and Brotli versions now join compiler version/settings/policy in that identity.
Nine plugin tests and seven semantic tests compare actual modules and React
props, getter/coercion order, financial edge cases, handlers, cancellation and
independent writes. Debug source maps, alternative minifiers, SSR/lib builds and
static chunks bypass the transformation; compiler failures stop the build.
No dependency or unsafe property/coercion option was added.

A second-pass probe saved 969 gzip/975 Brotli bytes, but the real ecma-only fresh
build grew 3 gzip bytes and saved only 72 Brotli bytes. Probe numbers are not
product savings. Hoist-functions and sequences experiments were not retained.
The final actual build takes 24.35 seconds and counts all 115 assets:
694015 gzip/591640 Brotli, a small 388/597-byte saving versus Phase 235.
Largest JavaScript is 495201 bytes; CSS 246349. Seven unchanged release budgets
still fail. More build work is traded for slightly less transfer, not universal
runtime speed or lower whole-browser RAM.

All 115 focused Node contracts pass without skips. All 497 component tests pass
before the final cache-only version-salt correction, with no subsequent component
edit. Full lint/source checks pass; dependency audit reports zero known advisories.
The initial browser attempt was explicitly stopped after 20 passing cases for
the real cache defect; it is partial evidence, not a full successful audit.
The final candidate-bound browser result is recorded in the final verification
report and Phase 236 worklog. No new full backend/PostgreSQL, hosted load,
independent device, provider or deployment acceptance is implied.
