# Acceptance Tests

Statuses in this document describe the required release gate. Actual command
results for the current revision are recorded in `FINAL_VERIFICATION_REPORT.md`.

| ID | Acceptance outcome | Evidence |
| --- | --- | --- |
| A01 | Fresh local startup applies every declared migration and reports ready with none pending | startup/readiness and migration tests |
| A02 | Production startup fails without auth and hosted durability declarations | auth and startup-readiness tests |
| A03 | Owner can complete persistent guided business setup and the identity appears on governed packages | onboarding, operations and issue-package tests |
| A04 | Opportunity intake, qualification, survey, conversion, and follow-up persist | opportunity, market-fit, bid, survey tests |
| A05 | WBS takeoff and rate build-up produce server-derived traceable estimate values | takeoff and estimate-rate tests |
| A06 | Quote approval, package creation, delivery, and acceptance remain separate | quote issue and communication tests |
| A07 | Schedule, crew, task, attendance, daily cycle, and Last Planner controls persist | planning and field tests |
| A08 | LMRA, permit, SDS, drawing, QC, NCR, and photo gates fail closed | assurance/evidence tests |
| A09 | Variation approval alone cannot contact a client or alter contract value | formal-variation and change-order tests |
| A10 | Procurement requires compliant trade partners and separate order delivery | bid-package, purchase-order, supplier tests |
| A11 | Invoice, credit, payable, receipt, and payment evidence reconcile without moving money | finance tests |
| A12 | Client portal tokens are scoped, expiring, job-bound, and approval-gated | client-portal and feedback tests |
| A13 | Duplicate or changed retries cannot create duplicate retained effects | idempotency/replay tests |
| A14 | Audit mutation, deletion, sequence gaps, or stale heads fail integrity/readiness | audit-integrity tests |
| A15 | Private evidence rejects unsafe types, traversal, tampering, and public serving | evidence and file-safety tests |
| A16 | Owner stop blocks scheduler and command application but permits dry run | operations-safety and scheduler tests |
| A17 | Support bundle and doctor expose diagnostics without records or secrets | operations-safety test and doctor smoke |
| A18 | Backup verifies DB/evidence hashes; restore revokes sessions, deactivates managed keys, and preserves integrity | backup/restore tests |
| A19 | Local backup migrates into an empty PostgreSQL/S3 target with parity | hosted migration contract test |
| A20 | Desktop/mobile navigation, onboarding, team access, loading, error, empty, offline, and field flows render | isolated Chromium browser suite |
| A21 | Build output is served by the production Node runtime with no legacy app | release-contract and container tests |
| A22 | Container runs non-root/read-only, handles signals, and retains state | container verification script |
| A23 | CORS, CSRF origin, proxy trust, rate limiting, sessions, and role boundaries hold | security integration tests |
| A24 | Hosted mode refuses non-EU/non-TLS/non-private/non-backed-up configuration | startup-readiness tests |
| A25 | Lint, dependency audit, release and HAI contracts, Node tests, build, unchanged bundle budgets, browser, Windows package, and container gates pass | CI and final report |
| A26 | All 23 framework families and 700 memberships are searchable; family playbooks expose guarded cadence and measure starters without fabricating evidence; scoped records retain immutable revisions and surface due reviews without execution authority | catalog, framework workspace, PostgreSQL, backup, HAI, and browser tests |
| A27 | A deterministic production-scale local ledger preserves historical search, full pipeline totals, bounded responses, audit integrity, startup/write latency, memory, and disk thresholds | ledger benchmark unit contract, `npm run benchmark:ledger`, and CI JSON artifact |
| A28 | Owner-managed team provisioning returns a key once, stores only a hash, scopes field access, redacts lists, and revokes sessions on rotate, deactivate, restore, and hosted migration | managed-access API, ledger, restore, PostgreSQL, and browser tests |
| A29 | Privacy-rights requests retain minimized identity evidence, deadlines, source-current assessments, independent approvals, restrictions, corrections, exports, and only supportable erasure outcomes | privacy ledger, API, recovery, PostgreSQL, and browser tests |
| A30 | Contractor.AI emits HAI `accountfeed.GenericItem` records that the maintained HAI parser accepts and normalizes to read-only `review_document` work with zero external commitments; owners can atomically publish to an absolute local path with read-back validation and checksummed status | HAI unit/API/role/browser, release, Windows package, and maintained-parser verification |
| A31 | Sign-in, all primary owner workspaces, representative dialogs, mobile navigation, and mobile/desktop client portal surfaces have zero axe violations for the selected WCAG 2.0/2.1 A/AA and WCAG 2.2 AA rules | pinned accessibility browser gate and `ACCESSIBILITY.md` |
| A32 | Owner suspension and resumption use a focus-trapped reason-and-acknowledgement dialog, restore initiating focus, persist the decision, and prove scheduler/command blocking at desktop and mobile widths | operations-safety Node and browser tests |
| A33 | Owner QA maintenance previews the complete eligible set, rejects stale and empty plans, verifies recovery before one atomic archive, preserves non-QA and verified-win records, and restores focus across desktop/mobile states | operations-safety Node, source, browser, backup, and audit tests |
| A34 | Unfinished central operator and client-portal forms recover only inside the same bounded, scoped tab session; secrets/files are excluded, logout clears operator drafts, navigation is not hijacked, and no ledger record exists before submission | Vitest hook tests, release source guard, and draft-recovery Chromium workflow |
| A35 | ngrok announces a tunnel only after local readiness, anonymous public rejection, authenticated public-edge projection, exact origin, loopback binding, and verified state pass; failure and shutdown close ingress before draining the app | ngrok unit/real-runtime tests, Windows package smoke, release contract, and Operations readiness UI |
| A36 | Release packaging rejects over-budget, missing or mismatched built surfaces before replacing a previous Windows package; retained size/hash evidence is verified against packaged bytes and Docker images cannot bypass the same gate | bundle-budget and Windows tests, real staged rejection drill, CI report and Docker build gate |
| A37 | The standard browser runner binds one built candidate, packaged runtime closure, React/style sources, browser cases/helpers and test configuration; changes before or after a batch reject the audit, and empty batches cannot count as success | browser-candidate and browser-runner tests; live candidate-change rejection drill; full-run candidate and coverage records |
| A38 | Browser test children inherit only explicitly allowed platform/browser settings, force local loopback operation and disable real external channels; production credentials, database/storage settings, private paths and Node preloads cannot leak into test servers | browser-runner environment tests and contaminated-parent full browser run |
| A39 | JPEG/PNG/WebP uploads require actual bounded decoding; private conversation previews have pixel/byte, concurrency and cache limits, preserve original checksums and current authorization, and explicit original downloads still work after preview failure | image-processor, conversation/server API, photo-reader/viewer/delivery component tests, Linux-musl native smoke and photo-resource Chromium workflow; total long-timeline browser RAM and real-device acceptance remain open |
| A40 | Finance/resource forms are absent from startup and unrelated-screen downloads, load through cached independent modules, retain the original controls and approval-safe callbacks, and allow a pending or failed form to close without unmounting the dashboard | dashboard-dialog-partition Node contracts, ActionDialogs and independent-workspace component tests, dashboard-dialog-performance and retained finance/resource browser workflows; complete-asset budgets still apply |
| A41 | All conversation viewers share at most eight preview leases per document; invisible previews release reads, images and object URLs, reentry reauthorizes, explicit downloads are independent, and waiting images remain manually selectable even without the observer API | ConversationPhotoVisibility and ConversationPhoto component tests, long-timeline/revocation and exact-original browser checks; not a bound on total browser/OS RAM or offline vaults |
| A42 | Opportunity and bid-package typing reuses exact nested JSON search text for unchanged eligible sources, avoids blank/hidden-view indexing, reindexes changed sources/filters, preserves input and original selection objects, and creates no ledger writes while searching | preconstruction-search-performance component and production-browser workflows, existing opportunity/bid/approval flows; serialization counts are scoped CPU-work observations, not universal latency or RAM guarantees |
| A43 | Canonical Node test children discard inherited credentials, private paths, provider settings, executable hooks and recursive test context; unique process storage survives reused Windows process IDs, native threads retain fixture storage, cleanup is guarded, and the explicit disposable PostgreSQL connection still verifies TLS | node-test-runner real child/preload/storage/thread/TLS regressions, PostgreSQL target guard, actual solver/build and legacy restore contracts; environment hygiene is not an OS or network sandbox |
| A44 | Built JavaScript/CSS keeps exact source bytes and chooses the smaller quality-10/11 Brotli body; ordinary browser encoding order reuses those exact sidecars, while explicit quality preferences, disabled Brotli, gzip, deflate, identity and HEAD retain correct bodies and headers | Brotli plugin fixtures, raw-wire static tests, all-asset source/hash/round-trip verification and asset-compression Chromium workflow with Resource Timing; no universal latency, CPU or RAM guarantee |
| A45 | Client-delivery typing does not rebuild unchanged history, photo choices or selected-scope lookup; active-offer matching and older-page merging use linear identity indexing, preserve all blocking states, incoming precedence/order, the ten-photo cap, source confirmation, role/locale/system-time-zone refresh and late-page cancellation | ClientDeliveryControlPerformance/retained component tests, getter-based current-real-ledger browser observations, approved publication/customer-photo/review/withdrawal flow and private-photo revocation/original-download checks; scoped CPU evidence, not total RAM or latency guarantees |
| A46 | Catalogue compression preserves original compact-token identities, every referenced NL/EN label and substitution, reordered-source coupling and non-literal evaluation order; unknown prototype-like and malformed token keys fall back safely while explicitly owned labels remain valid | operator-locale-compact Node regressions and served-production-catalogue Chromium checks across all 4434 entries and 8868 language outputs; all-asset measurements reject local-only compression wins; stable desktop/mobile capture waits for the closed drawer |
| A47 | Typing a new recovery-case draft reuses current source rows and retained case views; source selection indexing is linear and separates type/id identities; rights, source, job, time-zone and command-lock changes invalidate relevant views; abandoned reads abort without cancelling or replaying a submitted write | OperationalRecoveryControlPerformance and retained control/case component tests, explicit-zone formatter contracts and real-ledger recovery-performance Chromium workflow; exact retry, worker resumption, source reassessment, approval-gated replacement and customer/cost reviews remain covered; scoped CPU-work proof, not total RAM or universal latency |
| A48 | Late-generated preload code is minified only in eligible ESM production chunks with smaller raw/gzip and non-increasing selected Brotli bodies; cache identity includes compiler/settings/runtime encoders before filenames finalize; exact imports/exports, React values/handlers, getter/coercion order, financial edge cases, cancellation and independent writes are preserved | preload-chunk-minifier, web-minifier-policy and actual JSX/Vite chunk regression tests; complete-asset measurements and candidate-bound browser workflows; debug maps, alternative minifiers, SSR/lib builds and ineligible chunks bypass the optimization; build-time tradeoff, not universal speed or RAM proof |
| A49 | All 42 extracted operator action forms retain exact original JSX fields, constraints, translations, callbacks and parent props; each original condition gates an on-demand cached module; closing pending or failed code preserves the workspace/input without executing a command | operator-dialog identity/partition contracts, OperatorActionDialogs component tests and real-ledger operator-action-dialog-performance Chromium checks; first form loads one shared module, subsequent forms reuse it; deferred code remains included in whole-build budgets and is not a total-RAM or universal-latency guarantee |
| A50 | Customer-response typing does not rebuild unchanged retained photo lists or synchronously scan/write concept storage; quiet-interval and page-hide recovery retain the exact latest fields, while uncertain send attempts/receipts remain immediate; fresh list, private path, token and language invalidate the view; exact photo props, order, removal and escaped labels remain intact; office/customer share the existing authorized viewer chunk with its dependencies counted | ClientDeliveryResponsePerformance, ClientDeliveryPhotos and retained draft/retry components, private-viewer partition contract, served client-delivery photo-label/read/write observation and retained response/photo/approval browser workflow; original preview queues, leases, downloads and backend authority remain unchanged |
| A51 | Typing an existing recovery instruction does not rebuild unchanged source impacts; current source arrays, material-authority callbacks and explicit or detected system time zones invalidate the case-scoped view. Source-currentness, blockers, evidence selections, command hashes and independent approval remain authoritative | OperationalRecoveryCasePerformance and retained recovery/control/replacement/command components; real-ledger operational-recovery workflow instruments actual response titles during sequential input, then saves the instruction, reads it offline and requires current worker-resumption evidence before closure |
| A52 | The loaded client directory renders bounded 10/25/50-row pages; every loaded identity remains reachable, search retains its exact eight per-field case-insensitive comparisons without cross-field/key-name matches, and unchanged matching rows are reused during typing. New record arrays, locale, authority, busy state and callbacks remain current; shrinking data clamps the page. Navigation/search cannot issue commands | ClientDirectoryPerformance, IndependentWorkspaces and retained resource-pagination component tests; client-directory Chromium fixture observes actual response getters during sequential input, reaches the 500th loaded identity, opens/cancels the exact editor, switches language, and checks desktop/mobile containment, scoped axe and zero writes. The existing API load cap remains 500; no whole-browser RAM or universal-latency claim |
| A53 | Qualification worker pages render 25 rows by default, with 10/25/50 page sizes and reachable loaded identities. Active qualification/availability search reuses exactly the former JSON representation per source array. Unchanged visible qualification rows are reused; refreshed records, fallback workers, locale, permissions, submitting state and callbacks remain live. Search/filter/size resets, shrink/clamp/expand and empty results work without commands | QualificationPerformance, resource-search and retained resource-pagination components; qualification-performance Chromium read-only 500-worker fixture observes 46-character input, reaches the exact last-worker evidence editor and cancels, switches language, checks desktop/mobile scoped axe/containment and rejects business writes. Retained real-ledger qualification and availability cancellation/replacement/unknown-return workflows pass; default 500-worker API cap and unpaged job requirements are unchanged |
| A54 | Active and capability counts avoid DISTINCT only on scopes that cannot duplicate a non-null primary key. One-to-many request scopes retain deduplication; null IDs, terminal/null-status projects, orphan/global records, custom parameters, status/type/credential precedence and ready-state filters preserve the former counts. Cache and authorization rules remain unchanged | active-record-count adversarial SQLite tests, real PostgreSQL count parity, dashboard-cache/archive/lifecycle contracts, full Node suite and current candidate-bound archive/automation/audit browser workflows; controlled same-fixture comparison checks complete summaries except generated timestamps, not a whole-application latency or RAM guarantee |
| A55 | Dynamic tab preloads omit only exact already-loaded static JavaScript dependencies. New/dynamic modules, CSS, unknown paths and HTML preloads remain. Cycles, live graph removals and repeated outputs cannot introduce stale assumptions; disabled/custom policies and unsupported builds bypass filtering. Policy/compiler identity salts affected hashes before filenames finalize | loaded-preload-filter graph/adversarial tests and three real Vite fixture builds verify preserved child exports/CSS/new dependencies, repeatability and cache identity. Current canonical navigation, failed/cancelled form downloads, typing, private photos and offline browser workflows pass. Every emitted asset and shared dependency remains counted; no universal speed, RAM or closed-budget claim |
| A56 | Loading-list recommendations avoid tool/material/plan join fanout. Active-job scope, resource and plan statuses, null IDs and counts remain intact; newest five use stable ID ordering for equal timestamps. Forward migration 096 adds two covering indexes without rewriting business rows and is idempotent on reopen | loading-read SQLite adversarial and shared SQLite/PostgreSQL contracts exercise the actual production statement and nextActions path, high fanout, one-resource/empty jobs, existing/cancelled/rejected plans, record snapshots, query plans and upgrade from applied head 095. Controlled synthetic dashboard comparisons exclude only generated timestamps; extra index storage is measured, not a universal latency or RAM promise |
| A57 | `MAX_UPLOAD_BYTES` rejects non-finite, fractional, below-minimum, and over-100-MiB values before the HTTP server listens; default and valid integer upload limits remain supported | startup-readiness configuration regressions and existing server evidence-upload contracts |

## Browser candidate identity

The standard `npm run test:browser` command builds once, then hashes all served
files (including HTML, service worker and compressed sidecars), the runtime
closure from both packaging manifests, root/component application sources,
browser cases and their relative JavaScript dependency closure (including shared
image fixtures outside `e2e`), package lock, runner and Playwright configuration. The
candidate is rechecked before and after every batch. Missing or changed files,
new served files and linked directories reject verification; continuing after
ordinary scenario failures does not bypass a candidate-identity failure.
Empty audits/batches cannot report success. Automatic selection additionally
requires each exact file/title identity to execute once, with no skips or
unexpected cases. Ad-hoc selectors are development checks, not full-suite proof.

The standard runner retains `candidate.json`, `summary.json`, screenshots and
traces under an absolute `contractor-ai-browser-results-*` directory in the
system temporary directory, not in the product repository. The separate
temporary test ledgers are still cleaned on child completion. Live ledger state,
uploads and unpackaged documentation edits are not candidate inputs. Documentation
listed in either runtime packaging manifest remains part of the bound candidate.
Finish all edits to those packaged documents before beginning the final audit.
These hashes bind
local test evidence; they are not a package signature, installed-dependency
attestation or live-provider/production approval.

The CI browser step sets `TMPDIR` to the runner's temporary directory and retains
`contractor-ai-browser-results-*` through an always-run artifact step. This keeps
the candidate/summary and contained screenshot/failure traces available even
after a failed audit. That configuration is source-tested locally; an actual
remote CI run must supply its own publication and execution evidence.

The Playwright child receives an allowlist of operating-system, browser-cache,
CI display and optional screenshot-directory settings, not the operator's full
environment. Both test servers use local SQLite/filesystem mode on loopback;
scheduled autonomy, local AI, WhatsApp and live weather are disabled. Server
configuration supplies separate temporary ledgers/uploads, fixture role keys
and a fixture backup key. Hosted database/storage credentials, shared identity,
private paths, real provider tokens, proxies and Node preload options are not
inherited. This protects the repository harness; it is not a network sandbox or
proof that arbitrary future test code cannot make an explicit external request.

## Bundle and packaging gate

`npm run verify:bundle -- --report artifacts/bundle-budget.json` records exact
asset names, SHA-256 identities, uncompressed bytes, estimated level-9 gzip bytes
and actual precompressed Brotli bytes. A failed budget still writes its report
and exits nonzero; CI uploads that evidence without treating failure as success.
Use `--dist <directory>` to measure a private candidate rather than the served UI.
Missing required product chunks and unverified Brotli companions fail even if
their absent bytes would otherwise fit the limits.

Windows packaging checks the private staged build before replacing its target.
The package smoke verifies retained evidence against the actual packaged files
and current limits. Docker builds enforce the same gate before producing a runtime
image. No successful ordinary web build or historical package smoke substitutes
for this gate; failed limits remain release blockers.

## Browser audit mode

`npm run test:browser` builds the production UI and runs bounded, isolated
Chromium groups, stopping after the first failed group. Use
`npm run test:browser -- --continue-on-failure` to inspect every discovered
group while retaining a nonzero final exit status if any group failed.
This is diagnostic coverage, not permission to release with failures.

Each invocation keeps distinct group artifacts outside the repository under
the system temporary `contractor-ai-browser-results-<random>/batch-<number>`
directory. Its final JSON
summary identifies planned and executed groups, failed selectors, statuses
and artifact locations. Automatic groups use Playwright's exact file/title
test lists instead of mutable source line numbers. A separate coverage
reporter verifies each planned case is collected and attempted exactly once;
empty, missing, duplicate, unexpected, skipped or interrupted cases fail the group. Explicit caller-provided
Playwright filters retain their original behavior. Unexpected runner exceptions still stop the run;
they do not count as successful coverage. Both test servers use the runner's
Node executable and temporary ledgers, never the operator's live records.
The ordinary browser build still replaces checkout `dist`; do not treat this
command as an atomic live deployment.

## Manual provider acceptance

Database-test safety is an additional acceptance requirement: every PostgreSQL
integration file uses the shared disposable-target guard, and both the runner
and a direct test invocation reject unsafe targets before connecting.
`tests/postgres-test-database.test.js` checks this, including URL redirection and
credential-safe diagnostics. Hosted resource planning also checks mixed-role
replacement approval, dated forecast variance, stale-source rollback,
independent approval, restart persistence and unavailability without silent
reassignment in `tests/postgres-ledger-contract.test.js`.

The following tests cannot be truthfully completed from repository code alone:

- send one message through each enabled provider and reconcile its provider receipt;
- verify accounting, Peppol, banking, mapping, calendar, weather, and AI scopes;
- restore a managed PostgreSQL snapshot and an object version in the chosen EU
  provider;
- inspect the signed DPA, data residency, subprocessors, retention schedule, and
  incident process;
- execute a canary and rollback through the selected production ingress.

Until each provider passes its test, its external action remains disabled or
approval-blocked. A UI success state is never accepted as provider evidence.
