# Final Verification Report

## CI Baseline and Follow-Up Validation - 2026-10-13

Commit `03ecc782b958c5801c440b7a00b0acdc763dd0d6` was the PR head before the
mobile work-plan correction described below. It is part of open draft PR
[#97](https://github.com/Robert-Velhorst/002-Contractor-AI/pull/97).
Exact-head GitHub run [38342101583](https://github.com/Robert-Velhorst/002-Contractor-AI/actions/runs/38342101583)
completed at 2026-10-13 04:01 UTC with one browser-test failure. Release-contract
verification, HAI contract verification, lint, build, bundle budget, frontend
tests, Node tests, ledger performance, container tests and Windows standalone
packaging passed. The `operator calculates, approves, and revises a critical-
path work plan` test found a form input extending beyond the mobile viewport;
the other three tests in that browser batch passed.

The follow-up sets explicit width bounds on work-plan form controls. On Windows,
the full `e2e/work-plan.spec.js` file passed (11 tests), as did `npm run lint`
and `npm run verify:release`. This is focused local validation, not Linux CI or
a full browser-suite pass; the corrected PR head requires a new CI run.

The associated Vercel deployment check reports `pass`, but an unauthenticated
GET to its PR preview returned HTTP 302 to Vercel SSO. The preview is therefore
not independently accessible for public browser acceptance; deployment status
alone does not establish that the product is publicly reachable.

The measurements below belong to prior commit
`6fb463a30861f978d0f6ed1115dc264a850eb8d8`; they are historical and must not be
used as exact-head measurements for `03ecc782b958c5801c440b7a00b0acdc763dd0d6`:

| Gate | Result |
| --- | --- |
| Node test suite | `npm test`: 1,194 tests, 1,123 passed, 71 skipped, zero failed. Skipped provider/PostgreSQL cases are not counted as passing hosted evidence |
| Hosted handover integration | The updated reconciliation path passed against isolated PostgreSQL 16 with verified TLS, including evidence-tamper rejection and idempotent receipt recovery |
| Lint and production build | `npm run lint` and `npm run build` passed |
| Release contract | `npm run verify:release` passed: 107 canonical paths, 12 retired paths, 17 hosted environment keys, 852 source files |
| Bundle budget | `npm run verify:bundle` passed across 118 assets: 700,795 gzip / 599,564 Brotli bytes; largest JavaScript asset 370,088 bytes |
| GitHub CI | Run [38334647975](https://github.com/Robert-Velhorst/002-Contractor-AI/actions/runs/38334647975) was queued when this report was refreshed; it includes PostgreSQL-backed verification, browser tests, container verification, and the Windows standalone package gate |

These local checks do not prove a live EU deployment, provider-backed recovery,
legal/DPA acceptance, public ingress, or independent device/operator acceptance.
The older Phase 244 report below is retained as historical evidence and is not a
description of the current branch.

## Historical Verification - Phase 244, 2026-10-03

**Release status: blocked.** Loading recommendations now avoid tool/material/plan
join fanout. Forward migration `096_loading_read_indexes` adds two covering
indexes without rewriting business records. Status/scope/null-ID/count semantics
and the five-job limit remain; equal timestamps use stable ascending job IDs.
This does not change approvals, external execution, financial rules or cache
authority. Existing head assertions were mechanically advanced; historical
migration fixtures remain. No frontend or dependency source changes.

| Current gate | Result |
| --- | --- |
| Local contracts | 15/15 focused canonical tests, zero skips/failures, 14.357 seconds. Production statement and nextActions path cover fanout, single-resource/empty jobs, status/plan exclusions, tie/limit ordering, nullable legacy records, covering query plans, migration from applied 095, row preservation and idempotent reopen; active counts/cache contracts remain green. 716 source hashes stay frozen during this run |
| Scoped speed evidence | Initial private SQL prototype on copied 5,003-job fixture with 12 resource-heavy jobs: 20 dashboard samples each, same indexes, complete summaries equal except generated timestamps; median 780.68 -> 463.76 ms, 40.6%. Query medians 259.43 ms old/unindexed, 203.66 old/indexed, 14.70 proposed/indexed; index growth 147456 bytes. Subsequent built-statement D: repeat was stopped and supplies no final timing; no general navigation/RAM guarantee |
| Rendered behavior | 15/15 selected Chromium tests in two files, 48.3 seconds, exact collection/execution coverage and candidate revalidated. Candidate `f86daf93ec5eb32697b40ec09773c74e1e67e3af267cb798980977c48c88d3cb`. Existing frontend dist is reused against the current backend, not rebuilt. Navigation/typing, cancelled reads/downloads, fresh reentry, local paginated crew search, meaningful rendering, relevant console checks, scoped axe and actual Brotli transport pass. Inspected 1280x720/390x844 captures show no overlap |
| Quality | Full lint and whitespace pass. Source contract 107 canonical/12 retired/17 hosted/851 files passes. Fresh npm audit reports 0 known advisories across 451 dependencies |
| Size | All 118 existing JS/CSS assets count; gzip 700819/Brotli 599521 unchanged. Seven original gates still fail, CLI exits 1. No thresholds raised or dependencies excluded; no fresh build/package is claimed |
| Full-suite blocker | C: reached zero free space; the broad verified-TLS PostgreSQL/Node run failed during SQLite writes and lost final proof. It is not full-suite success. D: is exFAT; four link fixtures fail with EISDIR before assertions. That unsuitable broad repeat, a slow production benchmark and a second scale probe were deliberately stopped. Full NTFS/PostgreSQL, current complete browser, build/package and deployment acceptance remain open |
| Operator boundary | PID 27296 still started 2026-10-02 09:56:59 local; older port-3002 backend is not restarted or promoted. No operator records, Git publication or live provider action. Cleanup of two owned C: test databases was policy-denied; no workaround deletion. All owned Node/browser test runners have finished or been stopped. Docker inventory could not be confirmed after its read command hung |

Free C: space before normal operation and complete verification. D: evidence and
the explicit limitations are retained in `Contractor-AI-QA-phase244-mlNuU6`;
failed/stopped runs are separate from `node-focused.log` and `browser.log`.
React/debugging skills and canonical local runners were used; Browser plugin is
absent, so regular Playwright is the documented fallback. The goal stays active.

## Previous checkpoint - Phase 243, 2026-10-02

**Release status: blocked.** Phase 243 is a verified local build/performance
increment, not completion of maximum tuning or production acceptance.
No commit, promotion or deployment is performed by this update.

Dynamic tab loaders omit only JavaScript that the importer's exact static graph
already guarantees loaded. Dynamic/new modules, CSS, unknown paths and HTML
preloads remain. Disabled/custom policies and unsupported/debug builds bypass
filtering. Policy/compiler/implementation identity salts affected chunks before
names finalize; changed code cannot reuse a cached hashed filename. The module
is build-only and adds no runtime dependency, business or authorization change.

| Current gate | Result |
| --- | --- |
| Graph/cache proof | Eight new tests cover exact/transitive/cyclic static closure, preserved dynamic/new/CSS/unknown paths, live removals, output/watch reset, guards and compiler identity. Three real Vite fixture builds retain CSS and child exports/code and reproduce the same enabled output. Original unsalted TEMP probe is never shipped; its 380 removed references are not a count of extra downloads |
| Focused canonical Node | 132/132 over 17 files, 31.854 seconds, zero failures/skips. Includes preload/minifier semantics, graph partitioning, native React bridge, translations, compression, complete-asset budgets, static transport, offline shell, candidate/runner and release contracts. Prior complete 1188-check Phase 242 backend/PostgreSQL proof remains historical; all 84 current runtime hashes equal that candidate |
| Complete components | Fresh full 528/528 across all 85 files, two workers, terminal exit 0, 159.00 seconds. No React/style source changes; existing input, row reuse, live props/rights, drafts, exact retries, cancellation, protected media and field/client controls remain covered |
| Current browser | 44/44 in 18 selected files, one isolated batch, terminal exit 0, 3.9 minutes. Candidate `c9aada9924b653e61e9d5b872ea41c1d30dc566406ff18001c17fb0f2f2783a9`; groups 239 build/84 runtime/226 root-component/164 browser-closure revalidated. Discovery 181 is not full execution. Navigation/typing, cancelled/failed code, intake, exact translations, client/recovery, qualifications, protected photos and encrypted offline client/field/company flows pass |
| Rendered/transport proof | Current 1280x720 desktop and 390x844 mobile dashboard captures inspected without overlap. Page identity, meaningful content, no framework overlay, relevant console health, primary controls, scoped axe and containment pass. Actual Brotli response bodies/content lengths and resource timings match sidecars and decoded assets. Large-photo fixture retains 960x720 bounded preview, no automatic original read and one hash-verified original download; invalid/revoked source and deliberately failed-module cases remain separate negative evidence |
| Build/size | Build 23.86 seconds. All 118 JS/CSS assets count: gzip 700819/Brotli 599521, -533/-430 versus Phase 242, largest JS 370088/CSS 245894. Sidecars round-trip; every CSS body remains unchanged; any retained hashed filename has the same body. No limits raised and no shared dependency excluded. Small transfer/bookkeeping improvement is not a latency/RAM guarantee |
| Quality/operator boundary | Full ESLint, source contract 107 canonical/12 retired/17 hosted/848 sources, whitespace and fresh npm audit 0 known advisories/451 dependencies pass. Only loaded-preload-filter.mjs and vite.config.js change current product inventory; runtime/browser closures are identical to Phase 242. Seven identity-only static GETs match current dist on port 3002; PID 27296 remains started 09:56:59 local. No operator business write or restart; older backend code remains active there |
| Remaining gates | Seven original limits fail: gzip 700819/578500, Brotli 599521/540000, delivery 11949/8500, recovery 4495/4100, case 3957/3000, replacement 1694/1600, actions 1018/900. Full current browser audit, independent devices/cross-browser/assistive technology, whole-browser RAM/load, older-backend restart and package/EU/provider/operator acceptance remain open |

React/debugging skills and canonical runners were used. Browser plugin not
available; regular Playwright is the documented fallback. Current proof is
retained outside the repo in TEMP `contractor-ai-phase243-*` and browser root
`contractor-ai-browser-results-xIpH0T`. Initial unsalted compiler probe, one
over-strict mutable-HTML fixture assertion and one invalid budget-CLI argument
are retained separately, not success evidence. The production goal stays active.

## Previous checkpoint - Phase 242

**Release status: blocked.** Phase 242 is a verified local performance increment,
not completion of maximum tuning, production deployment or provider acceptance.
No commit, promotion or deployment is authorized or performed by this update.

The ledger avoids DISTINCT for record/project scopes that cannot duplicate a
non-null primary key. Request scopes remain DISTINCT because they may join
multiple projects. Four count branches retain all existing filters, null-ID
behavior and parameters. Cache authority, sums, permissions and approval rules
are unchanged. There is one product-source change and five test-file changes;
no frontend module, migration, integration or dependency is added.

| Current gate | Result |
| --- | --- |
| Controlled comparison | Same retained 5,003-job synthetic ledger, alternating AB/BA, 20 samples per variant after excluded warm-ups, summary cache cleared each time. Whole summaries match except generated timestamps. Median 567.49 -> 459.74 ms, 18.99% lower; p95 642.81 -> 534.15 ms. No business commands in the measured loop. This is scoped local evidence, not a general latency/RAM guarantee |
| Fresh production profile | All unchanged fixture, index, correctness, memory, disk and latency thresholds pass on 5,000 jobs/20,000 tasks/25,000 audit events. Cold summary p95 594.76 ms, warm 0.29 ms, protected 2.05 ms, intake 38.43 ms, audit verification 231.81 ms, database 38.49 MiB, process RSS growth 165.57 MiB. Earlier independent cold p95 was 509.13 ms; those separate runs do not establish a whole-profile speedup |
| Complete Node | 1,188/1,188 across all 260 files, zero failures/skips: 1,070 isolated checks in 354.439 seconds and 118 shared PostgreSQL checks in 395.682 seconds. PostgreSQL 16 uses verified TLS on a guarded disposable loopback database. All 711 frozen source/fixture hashes remain equal before/after the run; the owned container is removed |
| Test repairs | Initial broad run failed ten checks: eight source assertions omitted deferred action forms, and two equipment fixtures used a return deadline already in the past. Exact assertions remain and now read the real form modules; fixtures use explicit past checkout/future return timestamps. Product validation is unchanged. Focused 64/64 and subsequent complete tests pass. Four new SQLite count cases and one real PostgreSQL parity case cover the optimization |
| Current browser | Selected 38/38 across 13 files, one isolated batch, exit 0, 3.2 minutes. Candidate `55fcf3524f44b6df02887919113446b1408f5c95a549ef38b7ff1125f92fba05`; groups 239 build/84 runtime/225 root/component/164 browser-closure files are revalidated. Navigation, typing, intake, cursor audit, archive/restore, automation, five recovery cases, qualifications/availability, client/equipment/receipts and accessibility pass. Discovery 181 is not full 181 execution |
| Frontend / rendered checks | No React/style source or built-frontend byte changes from Phase 241. The previous full 528-component suite is retained historical proof, not a new rerun. Current 500-worker browser fixture still renders 25 rows, types 46 characters with one 500-record search projection and unchanged approved-row reads, reaches the exact final-worker editor, and sends zero business commands. Desktop/mobile scoped axe and containment pass; current qualification captures show no overlap |
| Build / size | Build 24.53 seconds; all 239 served files are byte-identical to Phase 241. All 118 JS/CSS assets remain gzip 701352/Brotli 599951, largest JS 371814/CSS 245894; sidecars round-trip and all original budgets remain unchanged. A private fallback-dictionary compression experiment grew totals and was rejected; Brotli parameter probes saved zero bytes and were not shipped |
| Quality / operator boundary | Full ESLint, source contract 107/12/17/846, whitespace and fresh npm audit 0 known advisories/451 dependencies pass. Current identity groups differ only at operating-ledger.js, which appears in the root/component and browser-helper closures as well as runtime inventory. Seven public identity-only static GETs on port 3002 match current files. PID 27296 remains the process started at 09:56:59 local; no restart or business write occurs. Backend improvements are not yet active in that old process |
| Remaining gates | Seven original limits still fail: gzip 701352/578500, Brotli 599951/540000, delivery 11949/8500, recovery 4523/4100, case 3981/3000, replacement 1694/1600, actions 1039/900. No limits raised or dependencies excluded. Full current browser audit, independent devices/cross-browser/assistive technology, whole-browser RAM/load, backend restart and package/EU/provider/operator acceptance remain open |

React/debugging skills and canonical runners were used. Regular Playwright is
the documented fallback for the unavailable separate Browser skill. Current
proof is retained in TEMP `contractor-ai-phase242-*`, the frozen-source proof,
and `contractor-ai-browser-results-SjclRX`. Failed initial tests/private compiler
probes remain separate from successful evidence. The production goal is active.

## Previous checkpoint - Phase 241

**Release status: blocked.** Local verification is not EU deployment, provider,
package or independent operator acceptance. No commit, promotion or deployment
is authorized or recorded by this update.

Phase 241 bounds loaded qualification workers to 25 visible rows by default,
reuses the existing 10/25/50 paging controls and caches the exact prior JSON
qualification/availability search representation only during an active mounted
search. Fallback worker rows and the requirement job lookup are memoized;
unchanged visible qualification rows use default React memoization. Refreshed
records, action callbacks, authority, busy state and locale remain live.
The existing default 500-worker register cap and unpaged job requirements stay
unchanged. Only three product frontend sources change; no backend change.

| Current gate | Result |
| --- | --- |
| Input work | Production-UI read-only fixture: 500 loaded qualification workers, 25 initial articles, 46 sequential characters, search-field reads 0 -> 500 once, approved-row reads 25 -> 25. Exact 500th worker evidence editor opens and cancels; business commands remain zero. Two explicit locale-only preference PATCHes are recorded separately; neither occurs during typing |
| Components / Node | Full components 528/528 across 85 files, two workers, 123.96 seconds. Focused canonical Node 122/122 across 16 files, zero failures/skips, 27.167 seconds. Qualification paging, fallback identity/index reuse, 45-character unit inputs, exact former projections, refreshed credentials/props and shrink/clamp/expand/empty results pass. No new complete backend/PostgreSQL/load run |
| Selected browser | 29/29 over ten files, one isolated batch, terminal exit 0, 1.8 minutes. Candidate `56926e2dd027658839d72526afc76b32b8b99912f40931fbd9c3ad7c3aee3941`; groups 239 build/84 runtime/225 frontend/164 browser revalidated. Discovery 181 is not full 181 execution. Real-ledger qualification review, three availability cancellation/replacement/unknown-return cases, 14 navigation/performance cases, client/equipment/receipt workflows, all 4434 translations and accessibility pass |
| Rendered checks | Inspected current desktop 1440x1000 worker/footer and mobile 390x844 toolbar/footer captures show no overlap. The qualification scope passes axe and containment in both sizes; page identity, nonblank view, no overlay/console errors, paging/search and exact editor checks pass. Existing credential-label contrast was reproduced and corrected with one qualification-only CSS override; independent device/assistive-technology acceptance is not claimed |
| Build / size | Final build 23.13 seconds. All 118 JS/CSS assets counted with verified Brotli round-trips: gzip 701352/Brotli 599951, +195/+5 bytes versus Phase 240; largest JS 371814/CSS 245894. Only the App CSS body changes. This is repeated-work/rendering improvement, not reduced total transfer or a whole-browser RAM/universal-latency guarantee. A four-rule CSS deduplication probe that worsened built CSS Brotli was rejected |
| Quality / operator boundary | Full ESLint and final browser-file lint, whitespace and source contract pass: 107 canonical/12 retired/17 hosted/845 sources. Fresh npm audit: zero known advisories/451 dependencies. All 84 runtime hashes equal Phase 240; changed product frontend paths are only App.css, ResourcesWorkspace.jsx and resource-search.js. Seven identity-only static GETs on port 3002 match current files; PID 27296 remains unchanged since 09:56:59 local. No operator business writes, restart, commit, push, provider or deployment action |
| Remaining gates | Seven unchanged limits fail: gzip 701352/578500, Brotli 599951/540000, delivery 11949/8500, recovery 4523/4100, case 3981/3000, replacement 1694/1600, actions 1039/900. No limits raised or dependencies excluded. Full current browser audit, independent devices/cross-browser/assistive technology, whole-browser RAM/load, backend restart and package/EU/provider/operator acceptance remain open |

React/debugging skills and canonical runners were used. The separate Browser
plugin/skill is absent; regular Playwright is the documented fallback. Current
evidence is in TEMP `contractor-ai-browser-results-nufsBP` and Phase 241 logs.
Failed contrast/translated-selector runs are retained as failures, not success
evidence. The production goal remains active.

### Previous checkpoint - Phase 240

Phase 240 bounds the loaded client directory to 25 rows by default, with 10/25/50
page sizes. A mounted, active-search index retains the exact eight former
per-field comparisons. Default React row memoization keeps unchanged matching
records out of repeated input rendering while fresh records, locale, authority,
busy state and callbacks remain current. The existing resource pagination is
shared without importing its workspace. Four existing client-directory text
colors are darkened after a reproduced contrast failure. No backend, provider,
permission or migration change is made; the existing 500-client load cap remains.

| Current gate | Result |
| --- | --- |
| Reproduced input work | Before the change, 101 loaded clients render 101 articles and a 500-client mount reads 500 row metrics. Corrected initial rows and metric reads are 25. The unit fixture types 45 characters without redrawing unchanged matching rows; its active index builds once and releases when search is cleared. Exact field comparisons, page reset/clamping and live callbacks/rights/locale are covered |
| Components / Node | Final full components 519/519 across 84 files, two workers, 142.49 seconds. Focused Node contracts 122/122 over 16 files, zero failures/skips, 30.436 seconds; includes the real client-directory API and existing partition/compiler/compression/static/runner/release contracts. No new complete backend/PostgreSQL/load run |
| Current selected browser | 24/24 across seven selected files in one isolated batch, terminal exit 0. Candidate `85b53f86dc74c543e85128db79769f2f531bc408dcef81e8c417fbc37535f825`; groups 239 build/84 runtime/225 frontend/163 browser revalidated. Discovery is now 180; this is not a full 180-case rerun. Phase 239's full 179-case proof is historical |
| Actual interaction | Read-only 500-client response fixture on the real built UI: 45 sequential characters build 500 billing search entries once, while metric reads stay 25 -> 25 and business commands stay zero. Every loaded record remains reachable; the 500th identity opens its exact editor and cancels without saving. One explicit `PATCH /api/preferences` containing only `locale: nl-NL` is separately verified for the requested language switch; no preference write occurs during typing |
| Rendered checks | Current desktop 1440x1000 and mobile 390x844 first-view/footer captures inspected with synthetic records; stable captures show no overlap. Mobile waits for hidden navigation instead of capturing its transition. Directory axe and containment pass in both sizes; page identity, nonblank screen, overlay/console and actual paging/search/editor checks pass. Selected suite also retains primary/dialog/portal accessibility, deferred navigation/cancellation, crew paging, equipment and receipt workflows |
| Build / size tradeoff | Final build 20.89 seconds; all 118 JS/CSS assets counted and Brotli sidecars round-trip. Gzip 701157/Brotli 599946, +549/+559 bytes versus Phase 239; largest JS 370958/CSS 245833. Only JobWorkspaceControls CSS body changes (the four scoped colors). This is bounded rendering/repeated-work improvement, not transfer, total-RAM or universal-latency proof. Locale ordering/pooling experiments that worsened total compression were rejected |
| Quality / operator boundary | Full ESLint plus final browser-file lint, whitespace and source contract pass: 107 canonical/12 retired/17 hosted/843 sources. Fresh npm audit reports zero known advisories/451 dependencies. All 84 runtime hashes equal Phase 239. Seven identity-only static GETs on port 3002 match current files; PID 27296 remains unchanged since 09:56:59 local. No operator business writes, restart, commit, push, provider or deployment action |
| Remaining release gates | Seven original limits fail: gzip 701157/578500, Brotli 599946/540000, client delivery 11949/8500, recovery 4520/4100, case 3979/3000, replacement 1693/1600, actions 1040/900. No limit raised or dependency excluded. Current full-browser, independent devices/cross-browser/assistive technology, whole-browser RAM/load, backend restart and package/EU/provider/operator acceptance remain open |

React/debugging skills and canonical runners were used; the separate Browser
plugin/skill is absent, so regular Playwright is the documented fallback. Current
evidence is in TEMP `contractor-ai-browser-results-XvrlBR` and the Phase 240 logs
listed in the worklog. Failed red/contrast/test-expectation attempts are retained
separately; they are not final success evidence. The production goal remains active.

### Previous checkpoint - Phase 239

Phase 239 reuses unchanged recovery-case source impacts while an operator edits
an existing instruction or closure note. The original source-list JSX is cached
only within the mounted case. New source arrays, material-navigation authority
and current time zone invalidate it. Blockers, source-currentness, evidence
selections, hashes and commands remain outside that view cache. No backend,
permissions, provider or migration change is made.

| Current gate | Result |
| --- | --- |
| Reproduced input work | Forty instruction characters grow forty source-title and material-quantity reads to 1640 each before the change. Corrected reads remain at the initial count; fresh source, material authority and explicit/detected system-zone cases pass. No global business-data cache |
| Component suite | Full 514/514 over 83 files, two workers, 117.72 seconds. Focused recovery suite 47/47 across six files, 18.22 seconds; exact uncertain retries, candidate rejection, stale/closed authority, current-source refresh locks, escaped evidence and source order remain covered |
| Focused Node contracts | 121/121 across fifteen partition/minifier/semantic/JSX/catalogue/compression/static/read/date/build/runner/release files; zero failures/skips, 24.531 seconds. No new complete backend/PostgreSQL or load round; all 84 runtime hashes match Phase 238 |
| Complete current browser | 179/179 discovered identities in 45/45 isolated batches; every planned/discovered/executed count matches, with zero missing, duplicate, unexpected, skipped or interrupted cases. Candidate `ce7c91da95c3cbb76c8f8913f0961d2e0b832cab3d9e1ebce59c64e31a1c72e7`; groups 237 build/84 runtime/224 frontend/163 browser revalidated after completion. This supersedes Phase 238's selected-only boundary |
| Actual interaction | Real temporary ledger: 77 instruction characters leave retained-source title reads 2 -> 2 with zero input API writes. The same case saves the instruction, exposes it in an encrypted offline work pack, records resumption and requires current evidence before closure. Current full audit also verifies coordinated replacement, supplier recovery, client/contract-date and cost impacts. Customer 56-character input still reads photo labels 1 -> 1, writes no API command and recovers on reload |
| Rendered checks | Current recovery desktop 1440x1000/mobile 390x844 captures inspected with synthetic records; no overlap observed, scoped axe/containment and page-error assertions pass. Complete audit includes primary-workspace accessibility, module-failure recovery, bounded media, navigation cancellation, intake, role isolation, finance, archive, approvals and offline flows. Expected negative HTTP statuses remain explained test evidence |
| Final build / size tradeoff | Build 20.97 seconds; all 117 assets count, Brotli sidecars round-trip. Gzip 700608/Brotli 599387, +58/+8 bytes versus Phase 238; largest JS 370916/CSS 245833. CSS bodies are unchanged. This reduces scoped repeated render work, not aggregate transfer or a measured whole-browser RAM/load guarantee |
| Quality / operator boundary | Full ESLint, whitespace and source contract pass: 107 canonical/12 retired/17 hosted/841 sources. Fresh npm audit reports zero known advisories/451 dependencies. Seven read-only static responses on port 3002 match current files. Operator PID 27296 remains unchanged since 09:56:59 local; no operator business writes or remaining owned runner/testserver. No commit/push/restart/provider/deployment action |
| Remaining release gates | Seven unchanged limits fail: gzip 700608/578500, Brotli 599387/540000, client delivery 11949/8500, recovery 4523/4100, case 3981/3000, replacement 1695/1600, actions 1044/900. No budget raised or dependency excluded. Independent devices/cross-browser/assistive technology, whole-browser RAM/load, backend restart and package/EU/provider/operator acceptance remain open |

React/debugging skills and the canonical runners were used. Separate Browser
plugin/skill is absent; regular Playwright is the documented fallback. Evidence
is outside the repository under `contractor-ai-browser-results-RsPOd3` and the
Phase 239 TEMP logs in the worklog. The failed pre-change assertions are genuine
reproductions, not final results. The goal remains active; these checks do not
prove production completion.

### Previous checkpoint - Phase 238

Phase 238 removes repeated photo-list work from customer-response typing. The
office and customer reuse a memoized list beside the existing private viewer;
fresh arrays, private path, token or language invalidate that view. Ordinary
fields now use the existing coordinated 180 ms draft flush and immediate
page-hide recovery. Frozen send attempts and photo receipts still call the
original immediate persistence path. Backend APIs, migrations, permissions,
preview queues/leases and provider behavior are unchanged.

| Current gate | Result |
| --- | --- |
| Reproduced input work | Forty retained photo labels grow from 40 to 1560 reads during 38 typed characters before the change; corrected reads stay 40. With the corrected timer fixture, 61 ordinary input events cause 61 immediate storage writes before the fix; after it, input produces zero storage reads/writes and pagehide writes one exact latest draft |
| Component suite | Final full suite 511/511 over 83 files, two workers, 131.00 seconds. Seven added cases cover retained photo work, fresh arrays/language, exact props/path/token invalidation, ordering/removal/escaped labels, pagehide/remount and one automatic flush at 180 ms. Existing uncertain upload/response, language switch and acknowledged-photo retry tests remain included |
| Focused Node contracts | 121/121 over fifteen files, zero failures/skips, 24.884 seconds. Adds the counted private-viewer partition contract to prior dialog/minifier/semantic/JSX/catalogue/compression/static/read/date/build/runner/release contracts. No new complete backend/PostgreSQL or load round |
| Current selected browser | 20/20 in 1.1 minutes: client delivery, both private-photo resource cases, all fourteen dashboard performance cases and all three deferred operator forms. Candidate `950b40170e940bf423ce5f4567b1af2da823f86754810b8e6b934fe3c1eef0cb`; groups 237 build/84 runtime/224 frontend/163 browser revalidated after completion and documentation. Runtime hashes exactly equal Phase 237 |
| Actual customer interaction | Real ledger/approved portal offer: 56 characters, photo-label reads remain 1 -> 1, zero input API writes. Reload restores name, note, response choice and authority checkbox before sending. Actual photo upload, receipt, independent approval, retained response, export and withdrawal still pass without closing the job |
| Rendering and private media | Customer desktop 1440x1000/mobile 390x844 screenshots inspected with synthetic test images; scoped axe/containment/page-error checks pass. Eight fallback preview leases remain bounded. Large-photo case: original 1638888 bytes/12192768 pixels, preview 3030 bytes/691200 pixels, zero automatic original reads and one verified explicit download. Expected revoked/expired 401/404 checks are negative-case proof, not unexplained success-console errors |
| Final build / all-asset tradeoff | Canonical browser build 23.63 seconds. All 117 assets and every sidecar count: gzip 700550/Brotli 599379, +52/-73 bytes versus Phase 237. Largest JS 370916/CSS 245833. All built CSS bodies exactly match Phase 237. The gain is scoped render/storage work, not substantial aggregate-transfer or total-RAM reduction |
| Quality / operator boundary | Full ESLint and whitespace checks pass; source contract 107 canonical/12 retired/17 hosted/841 sources. Current npm audit zero known advisories/451 dependencies. Seven read-only identity GETs match HTML, entry, App, catalogue, both delivery modules and the single viewer on port 3002; no operator business write, no restart, commit/push/provider/deployment action |
| Coverage boundary | There are still 179 discovered browser identities; this phase reruns the relevant 20, not all 179. Phase 237's complete result predates these frontend and chunk changes. Current complete-browser, independent device/cross-browser/assistive-technology, whole-browser RAM/load and EU/provider/package/operator acceptance remain open |
| Remaining size gates | Seven original limits fail: gzip 700550/578500, Brotli 599379/540000, client delivery 11949/8500, recovery 4522/4100, case 3928/3000, replacement 1694/1600, actions 1042/900. No limit raised or shared dependency excluded |

React/debugging skills and the canonical Node/component/Playwright runners were
used. Separate Browser plugin/skill is absent; regular Playwright is the
documented fallback. Final evidence is under `contractor-ai-browser-results-XUqKwT`
and the Phase 238 TEMP logs listed in the worklog. Initial timer-fixture timeouts
and partial chunk partitions are not accepted proof; final corrected results are
distinguished there. Frontend reload is needed; earlier backend fixes still need
the pending restart. This is verified progress, not production completion.

### Previous checkpoint - Phase 237

Phase 237 removes 42 operator action forms from the initial App chunk into one
cached on-demand module. Exact original JSX, conditions, fields, callbacks and
parent props are structurally verified against a snapshot of the dirty source.
Draft state and command handlers remain in App. A shared loading/error wrapper
allows closing before code arrives without a late form mount; it does not abort
the ESM network request. The first form loads the whole shared module and later
forms reuse it. The dossier and separate finance/resource/intake loaders remain.

| Current gate | Result |
| --- | --- |
| Structural identity | All 42 original templates, parent props, conditions and free bindings pass independent AST checks; the original source snapshot hash matches the retained manifest. No import cycle to App or provider/command side effect is introduced |
| Focused Node contracts | 120/120 over fourteen files, zero failures/skips, 28.115 seconds: both dialog partitions, minifier/semantic/JSX/catalogue/compression/static/read/date/build/runner/release contracts. No new complete backend/PostgreSQL or load round |
| Component suite | Final full suite 504/504 over 81 files, two workers, 129.64 seconds. Seven new cases cover cached module identity, exact decimal input, callbacks/submission locks, reason validation, late-close and contained import failure |
| Complete current browser | 179/179 exact discovered identities in 45/45 isolated batches; no failures, skips, duplicates, missing or unexpected identities. Candidate `a061ec328dfc0921cc5287d28da869de8a5f046f90b8f3e196945f135da1b811`; groups 237 build/84 runtime/223 frontend/163 browser rechecked throughout and after completion. Runtime hashes exactly match Phase 236 |
| Actual interaction proof | Crew module absent before opening, one download after open/close/reopen; 39 characters typed in 237.90 ms, zero input writes, one confirmed crew POST retaining hourlyRate 42.5. Delayed and 503 module cases close without replacing the dashboard or writing records. Navigation return 325.50 ms, one abandoned read, code warming without ledger reads. Intake 24 characters/73.60 ms, zero input API requests, recovered draft and one confirmed job. Local observations, not comparative or universal latency/RAM guarantees |
| Rendering and retained workflows | All 4434 catalogue entries/8868 language outputs/eight unknown keys pass. Current crew desktop 1280x720/mobile 390x844 screenshots inspected; scoped axe/containment/console checks pass. Full audit includes authorization, offline work packs, client/photo review, finance, shortage, uncertain retry, capacity/return, approvals and replacements. Recovery typing stays at 8 title/6 case reads and one response; reopening gets response two, retains three cases, zero recovery writes. Real channels remain disabled |
| Startup reduction | App 370910 raw / 90642 gzip / 72827 Brotli, down 124291 / 20729 / 14849 bytes versus Phase 236: 25.10% / 18.61% / 16.94% for that file only. Deferred module 146196 / 27103 / 22472. No claim of a 25% total-page, navigation or RAM improvement |
| Final build / all-asset tradeoff | Build 27.83 seconds. All 117 JS/CSS assets count and sidecars round-trip: gzip 700498/Brotli 599452 grow 6483/7812 bytes versus Phase 236. Largest JS 370910/CSS 245833. Initial loading is smaller, cumulative feature transfer is larger; nothing is excluded to improve the measured result |
| Quality and dependency audit | Full ESLint and whitespace checks pass. Source contract: 106 canonical paths, 12 retired paths, 17 hosted keys, 837 sources. Current npm audit: zero known advisories/451 dependencies. No dependency or unsafe minifier option added; no budget raised |
| Operator boundary | Seven read-only identity GETs match current HTML, entry, App, catalogue, both recovery modules and the new deferred module on port 3002. Operator PID 27296 remains unchanged since 09:56:59, no business-record write. Frontend needs reload; earlier backend fixes still need the pending restart. No commit/push, package promotion, provider or deployment action |
| Remaining release gates | Seven original limits fail: gzip 700498/578500, Brotli 599452/540000, client delivery 11855/8500, recovery 4520/4100, case 3929/3000, replacement 1694/1600, actions 1042/900. Independent devices/cross-browser/assistive technology, whole-browser RAM/load and EU/provider/package/operator acceptance remain open |

React and frontend-debugging skills, canonical Node/component/browser runners,
actual Chromium and complete-asset measurements were used. Separate Browser
plugin/skill is absent; regular Playwright is the documented fallback. Evidence
is outside the repository under `contractor-ai-browser-results-CLvHih` and the
Phase 237 TEMP logs listed in the worklog. Initial component fixture assumptions
and the first selected browser's missing Crew directory navigation were corrected
in tests, not business code. Those red attempts remain distinguishable from this
final proof. This is verified progress, not maximum performance or production
completion.

### Previous checkpoint - Phase 236

Phase 236 reduces Vite's late-generated dependency-loading code during the
production build. Only eligible ESM chunks are reconsidered, with smaller
raw/gzip and non-increasing selected Brotli bodies required. Compiler settings,
compiler version and Node/zlib/Brotli versions enter cache identity before
filenames finalize. Exact imports/exports, React values/handlers, coercion order,
financial edge cases, cancellation and independent writes remain covered.
No runtime/business workflow or external provider behavior changes.

| Current gate | Result |
| --- | --- |
| Reproduced defects | Initial compiler-policy regression 6/7; initial cache-encoder-version regression 8/9. Both pass after fixes. A re-minification probe saves 969/975 gzip/Brotli bytes, but the real ecma-only fresh build saves only 72 Brotli bytes and grows 3 gzip bytes; probe numbers are not release savings |
| Focused Node contracts | 115/115 over twelve files, zero failures/skips, 28.244 seconds: actual preload compiler/cache policy, semantic and React equivalence, JSX/Vite chunk identity, catalogue, compression, bundle, runner/candidate, release/static/read/date contracts. No new complete backend/PostgreSQL or load round |
| Component suite | 497/497 over 80 files, two workers, 126.88 seconds. This run precedes only the final build-cache version-salt correction, not any later component edit; final Node and complete browser checks cover that correction |
| Complete current browser | 176/176 exact discovered identities, 44/44 isolated batches, zero failures/skips/duplicates/missing/unexpected identities. Candidate `f4a335e83b1a3a636a3d2cf5e5bc375b84febfa994b2496f1696be261f4f22eb`; groups 233 build/84 runtime/221 frontend/162 browser rechecked before and after every batch. Final source revalidation passes; runtime hashes exactly match Phase 235 |
| Actual interaction proof | Navigation observation: return to Today 298.10 ms, one abandoned read, code warming without ledger reads. Intake: 24 characters in 149.30 ms, zero input API requests, draft recovered and one confirmed job. Recovery typing retains 8 title/6 case reads and one response; reopen gets response two, three retained cases and zero recovery writes. These are machine-local scoped observations, not universal latency/RAM guarantees |
| Rendering and retained workflows | All 4434 catalogue entries, 8868 language outputs and eight unknown keys pass on served code. Dashboard desktop 1280x720/mobile 390x844, recovery desktop 1440x1000/mobile 390x844 and catalogue captures inspected; scoped axe, containment and console gates pass. Full run includes authorization, offline work packs, client/photo review, finance, material shortage, uncertain retry, capacity/return and approval-gated replacements; real channels remain disabled |
| Final build / all-asset tradeoff | Build 24.35 seconds. All 115 JS/CSS assets counted with sidecar round-trips: gzip 694015, Brotli 591640, saving only 388/597 bytes versus Phase 235. Largest JS 495201/CSS 246349. Extra build-time CPU buys a small transfer reduction, not a large navigation or total-RAM improvement |
| Quality and dependency audit | Full ESLint passes. Source contract: 104 canonical paths, 12 retired paths, 17 hosted keys, 831 source files. Current npm audit: zero known advisories, 451 dependencies. No dependency added, unsafe minifier options enabled, budget raised or measured asset excluded |
| Operator boundary | Read-only identity checks match current HTML, entry, App, catalogue and both recovery modules on port 3002. Operator PID 27296 remains unchanged since 09:56:59; no business-record write. Frontend needs reload; earlier backend fixes still require the pending restart. No commit/push, package promotion, provider or deployment action |
| Remaining release gates | Seven original limits fail: gzip 694015/578500, Brotli 591640/540000, client delivery 11857/8500, recovery 4525/4100, case 3928/3000, replacement 1695/1600, actions 1042/900. Independent device/cross-browser/assistive-technology, whole-browser RAM/load and EU/provider/package/operator acceptance remain open |

React and frontend-debugging skills, canonical Node/component/browser runners,
actual Chromium and complete-asset measurements were used. Separate Browser
plugin/skill is absent; regular Playwright is the documented fallback. Evidence
is outside the repository at `contractor-ai-browser-results-jDrk1Z` and the
Phase 236 TEMP logs listed in the worklog. The initial browser attempt was
explicitly interrupted after twenty passing cases for a genuine cache defect;
it is not the complete audit cited above. This is verified progress, not maximum
performance or production completion.

### Previous checkpoint - Phase 235

Phase 235 reduces repeated recovery-panel render work and cancels abandoned
reads. Current source rows and retained case views are reused during unrelated
new-case typing. Selection is indexed by exact type and id. Source, authority,
job, time-zone and command-lock changes still invalidate the relevant view.
Only reads receive an abort signal: submitted writes and exact uncertain retries
are preserved. No backend business workflow or provider behavior changes.

| Current gate | Result |
| --- | --- |
| Reproduced bottleneck | Initial five component regressions: two pass, three fail. Original unrelated typing raises title reads 160 -> 2320 and case reads 72 -> 1368; selected-source identity reads reach 2500; abandoned reads have no abort signal |
| Corrected component checks | Full suite 497/497 over 80 files, two workers, 125.26 seconds. Six new cases plus existing control/case checks pass 30/30 in 17.84 seconds. Final fixture typing stays at 80 title and 24 case reads; 80 sources/40 selections use 160 identity reads. Separate regressions preserve rights, changed sources, job navigation, time zones, exact identities and submitted writes |
| Focused Node contracts | 106/106, zero skips/failures, 26.07 seconds: recovery domain/API/command-plan, explicit-zone dates, read cancellation, bundle, JSX, browser candidate/runner and release contracts. No new full backend/PostgreSQL or load run; Phase 231 remains historical evidence |
| Current selected browser | 24/24 in 1.9 minutes on candidate `d9cf4dbcb8a88223e312af6d74db92ffe93dce53c10864a6031548548d9a9700`, groups 233/84/220/162. Production build 13.99 seconds. Real ledger recovery typing stays at 8 title/6 case reads and one response; closing aborts the pending read, reopening obtains response two, three retained cases and source hash stay unchanged, zero recovery writes. Desktop 1440x1000 and mobile 390x844 captures inspected; scoped axe, containment and console checks pass |
| Related interactions | Fourteen dashboard/navigation/performance cases, all five operational-recovery cases, retained catalogue, actual cost, uncertain replacement retry and work-balance approval pass. Includes source reassessment, same-worker resumption through encrypted offline instructions, supplier/customer reviews and combined absence/material/date/cost closure. Real external channels remain disabled |
| Coverage boundary | Discovery now has 176 browser identities. This phase executes the selected 24, not a new complete audit; Phase 234's complete 175-case result predates these product changes |
| All-asset tradeoff | All 115 JS/CSS assets count and sidecars round-trip: gzip 694403, Brotli 592237, +298/+337 bytes versus Phase 234. Recovery measurement 4569 gzip includes the newly shared 158-byte cancellable-read helper; none is hidden. Largest JS 496042, CSS 246349. This improves scoped CPU work, not aggregate transfer or total RAM |
| Quality / local serving | Full ESLint and source contract pass: 103 canonical paths, 12 retired paths, 17 hosted keys, 828 source files. Read-only identity requests verify current HTML, entry, catalogue and both recovery modules on port 3002. PID 27296 is untouched; UI requires reload and earlier backend fixes still need the pending restart |
| Remaining release gates | Seven unchanged limits fail: gzip 694403/578500, Brotli 592237/540000, client delivery 11857/8500, recovery 4569/4100, case 3969/3000, replacement 1694/1600, actions 1064/900. No budgets raised/assets excluded. Complete-current-browser, independent devices/cross-browser, whole-browser RAM/load and EU/provider/package/operator acceptance remain open |

React and frontend-debugging skills, canonical Node/component/browser runners,
actual Chromium and all-asset measurements were used. Browser plugin/skill is
absent; regular Playwright is the documented fallback, not absence of CUA.
Evidence and screenshots remain outside the repository; paths are in Phase 235
of the worklog. No operator records, providers, permissions, containers,
deployment, commits or pushes changed. This is verified progress, not maximum-
performance or production completion.

### Previous checkpoint - Phase 234

Phase 234 preserves compact translation identities while sorting only pure
retained catalogue keys at build time. A real inherited-property lookup defect
is fixed: unknown `constructor`/prototype-like labels no longer crash variable
interpolation. All referenced texts and both languages remain unchanged. This
phase's compression benefit is small and does not close the aggregate budgets.

| Current gate | Result |
| --- | --- |
| Complete browser audit | 175/175 exact discovered cases, 44/44 isolated batches, no failures, skips, duplicates, missing or unexpected identities. Candidate `dd26352696af0295ed154868914cea13cc41f3d1e25609e9d996acc72cb9ce94`; all served/runtime/frontend/browser groups rechecked before and after each batch. Navigation, input, field/offline, retained business workflows, authorization, photos, recovery and accessibility cases execute; not a live-provider or real-device audit |
| Final screenshot strengthening | Only `e2e/operator-locale-performance.spec.js` subsequently adds a closed-drawer visibility assertion before mobile capture. Both catalogue/transport cases rerun: 2/2 in 11.4 seconds, candidate `7bdc984290ed212a96ef4d6af16c4a83fea99f8353dc8945a9e06a21ba2b95e6`. Exact comparison proves build/runtime/frontend groups unchanged; only that test differs. The full 175 run predates this stronger assertion, not any product change |
| Catalogue fidelity / fallback | Node and actual served minified ESM check all 4434 referenced entries, 3376 compact tokens and 8868 language outputs with interpolation. Eight unknown/malformed keys pass in the browser; own constructor labels and non-literal evaluation order have Node regressions. Initial inherited-key failure was reproduced, not inferred |
| Component / Node checks | Full component suite 491/491 over 79 files, 132.16 seconds, two workers after the runtime lookup fix. Corrected build-only compactor passes 88/88 focused Node contracts, no skips, 20.79 seconds. No new full backend/PostgreSQL run; Phase 231's 1156-case verified-TLS result remains historical |
| Whole-build measurement | Final build 14.70 seconds. All 115 JS/CSS assets counted and every sidecar round-trips. Gzip 694105, Brotli 591900: only 241/54 bytes saved versus Phase 233. Catalogue 203765 raw, 58398 gzip, 50486 Brotli. App 496039 raw, CSS 246349 |
| Rejected experiment | Dutch-text token renumbering reduced the catalogue by 904 gzip/974 Brotli bytes but enlarged the whole build by 746/850 to 695092/592804. Rejected; its full audit was explicitly interrupted after 16 passing cases, not accepted as full proof. Probe figures never replace whole-build measurements |
| Quality / local serving | Full ESLint, whitespace check, final candidate revalidation after documentation edits and source contract pass: 103 canonical paths, 12 retired paths, 17 hosted keys, 826 source files. Read-only identity requests verify current HTML, entry module and catalogue bytes on port 3002. Operator PID 27296 is untouched; frontend needs reload, earlier backend fixes still need the pending restart |
| Remaining release gates | Seven original failures: gzip 694105/578500, Brotli 591900/540000, client delivery 11857/8500, recovery 4239/4100, case 3939/3000, replacement 1673/1600, actions 1039/900. No assets excluded or budgets raised. Cross-browser/device/RAM/load and EU/provider/package/independent operator acceptance remain open |

Final desktop/mobile screenshots were inspected after the drawer transition had
finished. Separate Browser plugin/skill is absent, so canonical Playwright was
used; CUA is available but not needed. Exact logs, candidates and the one-test
comparison are recorded in Phase 234 of the worklog. No operator records,
providers, permissions, containers, deployment, commits or pushes were changed.
This is verified progress, not maximum-performance or production completion.

### Previous checkpoint - Phase 233

Phase 233 reduces repeated client-delivery render work without changing business
commands or backend storage. Current history, photo choices and selected-scope
lookup are reused during unrelated input. Source, role, locale, time zone, selection and
action-gate changes invalidate their relevant views. Active-offer matching and
older-page merging now use identity sets rather than nested scans. Incoming-page
precedence/order, ten-photo cap, uncertain retry, current-source approval and
late-response cancellation remain covered. View caching trades retained current
render objects for less repeated work; it is not a total-RAM reduction claim.

| Current gate | Result |
| --- | --- |
| Complete component suite | 491/491 over 79 files, 129.66 seconds, two workers. Includes six new performance/lifecycle cases and all six existing delivery-control cases. Getter fixtures show unchanged history/photo/scope reads during unrelated typing, linear candidate/merge bounds and invalidation on source/rights/locale/system-time-zone changes |
| Focused Node contracts | 111/111, zero failures/skips, 27.63 seconds: delivery/conversation domain/API, image processing, server/static transport, unchanged bundle contracts, JSX fingerprints, browser candidate and release contracts. No backend source change this phase. Phase 231's complete verified-TLS run and Phase 232's negotiation-specific suite remain previous proof, not a new full Node/PostgreSQL round |
| Actual browser workflow | 7/7 selected cases, 41.9 seconds, on candidate `781fd1f93f784e5dd0e049e83837e9a55e2acaf4e5dea6cb4af60f6548a26148` (233/84/220/160 files). Real ledger intake/retained production/portal access, source-bound publication, independent approval, customer response/photo, office review, export and withdrawal pass. Getter instrumentation returns original response values: history-title reads stay 4 -> 4 while typing a withdrawal draft; photo attachment reads remain unchanged while typing the recipient. No synthetic replacement API payload or business writes from those typing/cancellation checks |
| Related browser safety | Exact precompressed transport, deferred/error/cancelled finance forms, offscreen photo leasing, authorization revocation and byte-identical requested original downloads pass. Desktop/mobile screenshots inspected; selected office/client/nav axe checks pass. Private-photo 401/404 responses are intentional negative tests, not ignored app failures |
| Build / size tradeoff | Build passes in 16.24 seconds. All 115 JS/CSS assets count. This CPU optimization adds 208 gzip and 112 Brotli bytes versus Phase 232: 694346/591954 total; client-delivery surface 11857 gzip. App raw stays 496039; CSS 246349. No transfer saving claimed for this phase |
| Lint / source / candidate | Full ESLint, whitespace check and source contract pass: 103 canonical paths, 12 retired paths, 17 hosted keys, 825 source files. Final candidate revalidation passes after documentation edits; browser discovery remains 174 |
| Remaining release gates | Seven unchanged failures: gzip 694346/578500, Brotli 591954/540000; client delivery 11857/8500, recovery 4239/4100, case 3940/3000, replacement 1674/1600, actions 1040/900. Budgets and measured asset set are not relaxed |
| Operator boundary | Read-only public-asset checks confirm port 3002 serves the exact current build entry. Operator PID 27296 is untouched; frontend changes require a page reload, while Phase 232's direct-sidecar backend fix still needs its pending server restart. No provider/deployment/package/commit/push or operator-record mutation |

The full current 174-case browser audit, cross-browser/real-device acceptance,
whole-browser RAM, sustained load, remaining bundle gates and EU/provider/package/
independent operator acceptance are still open. This phase is verified progress,
not production completion. Exact logs/candidate/screenshots are in the worklog.

### Previous checkpoint - Phase 232

Phase 232 repairs actual browser asset negotiation and moves compression effort
to the build. Standard Chromium `gzip, deflate, br, zstd` previously bypassed the
sidecar and invoked streamed, lower-quality dynamic Brotli. The direct route now
uses pinned Negotiator 1.0.0's documented preference-options shape. Explicit
quality values and disabled encodings remain respected. Every build picks the
smaller quality-10/11 representation per file; higher effort can otherwise enlarge
small assets. Original source bytes, names and gzip measurements are unchanged.

| Current gate | Result |
| --- | --- |
| Focused Node contracts | 102/102, zero skips/failures, 32.14 seconds; static raw-wire/HEAD/quality negotiation, API/auth/proxy security, compression plugin, bundle, JSX bridge, candidate, runner and release contracts. Phase 231's complete 1156-case verified-TLS run remains historical; not a new full backend/PostgreSQL round after this runtime edit |
| Production build / all assets | Build passes in 14.38 seconds. All 115 original JS/CSS hashes and gzip sizes match Phase 231; every Brotli body decodes exactly and none grows. Brotli 604054 -> 591842 bytes, saving 12212 (2.02%) across all built assets, not necessarily every navigation |
| Browser transport / interactions | 19/19 selected workflows pass in 45.3 seconds on candidate `67f607bc3a3b7203997efc6d4cd5af069e60b0c49074dcffe39bc471daa43db4` (233/84/220/160 files). 23 actual asset responses have exact decoded bodies, sidecar lengths and matching nonzero Resource Timing encoded sizes. Tab navigation, deferred/error/cancelled forms, large-directory typing and indexed preconstruction search pass. Desktop/mobile screenshots inspected; scoped topbar/sidebar axe and console checks pass |
| Actual App transfer | Chromium receives 87874 bytes for App JS on the fixed isolated server. The still-running old operator server sent 108025 bytes with the same normal encoding header, missing Content-Length and dynamic streaming: the observed difference is 20151 bytes (18.65%). This compares a specific asset response, not page speed or load capacity. Quality-10 sidecar alone was 89563 bytes |
| Coverage boundary | Fresh discovery: 174 browser identities, only the selected 19 executed this phase. Phase 230's 485 component checks are previous proof; no frontend source edit. No full-current-browser, cross-browser, device, load or whole-browser RAM acceptance |
| Lint / source / dependency | Full ESLint and source contract pass: 103 canonical paths, 12 retired paths, 17 hosted keys, 824 source files. Negotiator 1.0.0 is explicitly pinned in manifest/lock and matches installed bytes; compression retains its own 0.6.4 parser. No new package download or live-provider operation |
| Bundle budgets | Still seven unchanged failures: gzip 694138/578500, Brotli 591842/540000; client delivery 11646/8500, recovery 4238/4100, case 3940/3000, replacement 1674/1600 and actions 1041/900. All 115 assets count; no limits raised |
| Operator boundary | Existing operator PID 27296 is still running the earlier backend. New direct-sidecar negotiation needs the previously pending server restart; it has not been activated on port 3002. No restart workaround, second operator instance, operator data change, package, deployment, commit or push |

Two earlier browser rounds failed the exact Content-Length check. Switching from
Playwright `headers()` to `allHeaders()` did not fix it; traces proved real dynamic
compression, not incomplete header reporting. A raw-wire regression reproduced
the issue. An intermediate implementation used the older parser's array argument
against version 1.0.0 and still failed (101/102); the correct options object passes
all 102 and the original browser assertion. No failing test was removed. Full
evidence and the initial invalid zero-asset compression probe are in the worklog.
Production readiness and maximum-performance claims remain unproven.

### Previous checkpoint - Phase 231

Phase 231 hardens the canonical Node verification path without changing the
application runtime or its frontend. Children inherit an explicit platform
allowlist, not operator credentials, storage paths, provider settings, executable
hooks or recursive Node test context. Default storage is unique per process even
when Windows reuses a PID. Native solver/build threads preserve their parent's
explicit fixture storage. Only a guarded disposable PostgreSQL URL and its
configured CA pass through; no TLS verification is disabled.

| Current gate | Result |
| --- | --- |
| Complete Node contracts | 1156/1156 across all 255 discovered files, zero failures/skips: 1039 in 238 independent files with four workers, 117 in 17 PostgreSQL-sharing files serially. Node 22.23.2; stage durations 233.97 and 383.63 seconds. PostgreSQL 16 uses a dedicated loopback container, test-only role/database and verified TLS. This is local database proof, not EU production load/deployment acceptance |
| Final runner regressions | 8/8, no skips, 0.706 seconds of tests plus fixture setup. After the complete run, only runner-test assertions were strengthened: an explicit execution receipt must exist and its completed runtime directory must be removed; a synthetic recursive context is explicitly rejected. The final eight cases rerun with actual verified PostgreSQL TLS; no new complete round after this test-only strengthening |
| Failure/repair evidence | Initial child probe exposes inherited benign preloads and recursive-test skipping. First broad attempt: 1018/1039 pass, 21 failures from native-thread directory collision. Second: 1033/1037 pass, three reused-PID startup failures and one implicit legacy-restore path failure; neither proceeds to the shared PostgreSQL stage. Focused repairs pass 136/138 with two PostgreSQL skips before the complete accepted run. No assertions or cases removed |
| Existing UI proof | No new component/browser round: Phase 230's 485 component tests and 23 selected browser workflows remain previous evidence. Fresh comparison confirms identical build/runtime/frontend/browser groups and candidate `67c1b86967a951c2aced7c0c53cd01924db4ccad64c82999e0fbc9195675c5ab` (233/84/220/159 files). No new product build, paint/RAM/device measurement or complete 173-case browser audit |
| Lint / source contract | Pass. 103 canonical paths, 12 retired paths, 17 hosted keys and 823 source files; the trusted Node test bootstrap is now a required repository path |
| Bundle budgets | Fresh check still fails seven unchanged limits across all 115 JS/CSS assets: gzip 694138/578500, Brotli 604054/540000; client delivery 11646/8500, recovery 4238/4100, case 3940/3000, replacement 1674/1600 and actions 1041/900. No bytes saved, assets excluded or budgets raised in this test-only phase |
| Runtime / external boundary | Existing loopback operator PID 27296 remains observed. Owned disposable PostgreSQL fixtures, keys and process storage are cleaned; unrelated containers are not changed. No operator-server restart/bypass, second operator server, provider, package, deployment, commit/push or independent operator acceptance |

The runner is environment hygiene for trusted repository tests, not a filesystem
or network sandbox. Legacy restore fixtures now explicitly discard inherited
default storage; the v2 fixture additionally verifies the restored state bytes.
Product restore configuration precedence and business behavior are unchanged.
Seven bundle gates, full browser/load/device proof, the previously pending API
restart and package/EU/provider/operator acceptance remain open. Exact evidence
and intermediate failures are retained in the Phase 231 worklog.

### Previous checkpoint - Phase 230

Phase 230 removes repeated full-dossier serialization from opportunity and
bid-package typing. Exact nested JSON search text is memoized only for eligible
records while searching, rebuilt on source/filter changes and dropped when search
is cleared or the opportunity view is hidden. Selection still returns the
original source object; no business decision, authorization or approval is cached.

| Current gate | Result |
| --- | --- |
| Focused Node contracts | 99/99 across nine files, no skips, 9.43 seconds. Opportunity/bid lifecycle and actual authorized bid API, offline/source compatibility, exact deferred-form JSX and locale/browser/budget contracts. Two stale compatibility tests now inspect relocated financial labels in the actual dialog and retain parent wiring/source checks. No new complete 254-file backend or PostgreSQL round |
| Component tests | Complete 485/485 across 78 files, 150.58 seconds. Seven new search regressions cover repeated/nested searches, eligible-only work, hidden/blank views, source/filter invalidation, retained input and original-object selection; unrelated locale/authority rerenders do not repeat indexing |
| Selected browser workflows | 23/23 in 1.2 minutes on candidate `67c1b86967a951c2aced7c0c53cd01924db4ccad64c82999e0fbc9195675c5ab`: new real-ledger search, opportunity conversion, approved bid/purchase-order receipt workflow, deferred forms, full selected dashboard performance scenarios, draft recovery and private photo/revocation/original-download checks. 173 discovered identities; not a full current-candidate audit |
| Measured search work | Before repair, component fixtures serialize 50 eligible packages 5000 times across 100 search edits; now 50 times. Opportunity fixture: 5050 -> 50 across its initial search plus 100 changes. Production-browser fixture serializes eight opportunities once and six packages once across typing/nested-query changes; zero unsaved ledger writes. These are scoped serialization counts, not a claim of 100-times-faster overall interaction |
| Rendered QA | Existing Playwright path because separate Browser plugin/skill is absent, not because CUA is unavailable. Correct title/content, no framework overlay, normal application console/page-error checks, scoped axe and containment pass. Final 1440x1000/390x844 search screenshots inspected. First run was already 23/23, but a mobile screenshot caught the drawer mid-transition; final test explicitly verifies hidden navigation before capture |
| Production build / candidate | Pass: 11.94 seconds. 233 build, 84 runtime, 220 frontend and 159 browser files bound; current candidate verified unchanged after documentation edits. The initial and final browser candidates retain identical build/runtime/frontend source groups; only the strengthened browser assertion changes |
| Lint / source contract / whitespace | Pass. 102 canonical paths, 12 retired paths, 17 hosted keys and 821 source files. Final full lint includes new search regressions and compatibility-test repairs |
| Bundle budgets | Seven unchanged failures across all 115 JS/CSS assets: gzip 694138/578500, Brotli 604054/540000; client delivery 11646/8500, recovery 4238/4100, case 3940/3000, replacement 1674/1600, actions 1041/900. Aggregate grows 110 gzip/59 Brotli bytes versus Phase 229. Pipeline/bid chunks add 48/46 gzip bytes for index lifetime management. No budget changes, omissions or claim of transfer savings |
| Local runtime / release | Existing loopback PID 27296 observed unchanged on port 3002. Current frontend is built; no backend source/operator-data changes, second operator server or restart workaround. The earlier API restart for server photo previews remains pending. No commit/push, provider, deployment, package promotion or independent acceptance |

The search index trades temporary normalized text memory for less repeated CPU
work and is component-local; it is not a browser-RAM bound or a new persistent
cache. Full current backend/browser/hosted rounds, hostile-input/device-memory
load, independent operator/provider acceptance and seven bundle gates remain open.
Initial red cases, stale-test repairs and exact evidence paths are retained in
the Phase 230 worklog. Production-readiness remains unproven.

### Previous checkpoint - Phase 229

Phase 229 bounds conversation-preview lifetime: one shared document observer
admits at most eight preview leases. Leaving the near-viewport window aborts
pending previews, revokes URLs and removes images without moving their frames.
Reentry checks access again; late aborted bytes cannot overwrite a newer image.
Explicit original downloads survive preview release. A manual photo button also
works without IntersectionObserver, still under the eight-lease limit.

| Current gate | Result |
| --- | --- |
| Focused Node contracts | 82/82 across nine files, no skips, 17.09 seconds. Includes actual conversation authorization/tamper/original contracts, native image processing, source partitions and browser/bundle verification. No new complete 254-file backend or PostgreSQL round |
| Component tests | Complete 478/478 across 77 files, 112.62 seconds. Six new regressions cover release/reentry, shared eight-lease admission, stale aborts, revoked access, observer-unavailable selection and independent original downloads |
| Selected browser workflows | 10/10 in 56.9 seconds on candidate `5c81b34203ec37a9b9d18f8929f422ca5cdce4b6ceb1d4c14469fb3574148262`: private photos, real revoked-token reentry, manual mobile selection without the observer, exact original download, client delivery/chat, offline worker/client/company flows and deferred financial forms. 172 discovered identities; not a full final-candidate audit |
| Rendered QA | Existing Playwright workflow because the separate Browser plugin/skill is absent, not because CUA is unavailable. Page identity/content, no framework overlay, normal application console/page-error checks, scoped axe and containment pass. Final 1440x1000/390x844 door previews and waiting-photo mobile screenshots visually inspected. Expected denied reads after intentional token revocation are not reported as clean successful reads |
| Measured photo work | All 12 fixture photos are visited; active app preview URLs peak at three in the observed viewport and finish at two (22 created/20 revoked). Observer-unavailable context renders eight, then a real manual click admits the last image without exceeding eight. The tiny fixture's 168 encoded peak bytes are not browser RAM. A separate 12MP fixture is 1639442 original bytes/2994 preview bytes, 12192768/691200 pixels; zero automatic original reads and one exact original download |
| Production build / candidate | Pass: 13.28 seconds. 233 build, 84 runtime, 220 frontend and 158 browser files bound; current candidate verified unchanged after documentation edits |
| Lint / source contract / whitespace | Pass. 102 canonical paths, 12 retired paths, 17 hosted keys and 819 source files; final full lint includes the real mobile fallback browser check |
| Bundle budgets | Still seven failures across all 115 JS/CSS assets: gzip 694028/578500, Brotli 603995/540000; client delivery 11646/8500, recovery 4239/4100, case 3938/3000, replacement 1672/1600, actions 1039/900. Aggregate transfer grows 483 gzip/396 Brotli bytes versus Phase 228. No budget changes, exclusions or claim of JavaScript savings |
| Local runtime / release | Existing loopback PID 27296 observed unchanged on port 3002. No backend source/operator data change this phase. Current frontend is built, but server-generated small previews still require the previous policy-blocked API restart. No alternative termination, commit/push, deployment, provider or package promotion |

The lease cap does not bound whole-browser/OS RAM, opened/downloaded originals,
offline vaults or other surfaces. Without the observer, geometric offscreen release
is not guaranteed. Returning to a released photo incurs a fresh authorized read:
this is the deliberate memory/access tradeoff, not an all-network-work reduction.
Full current backend/browser/hosted rounds, hostile-input load, real device and
independent operator/provider acceptance remain open. Exact evidence paths and
the initial red component tests are retained in the Phase 229 worklog.

### Previous checkpoint - Phase 228

Phase 228 defers the unchanged finance/resource action forms into two independent
cached modules. Pending forms remain dismissible; a failed form loads an isolated
error dialog rather than unmounting the dashboard. Draft ownership and existing
approval handlers remain in the parent. A new browser accessibility check also
found and repaired low contrast in the shared field-record context caption.

| Current gate | Result |
| --- | --- |
| Focused Node contracts | 69/69 tests across seven files, no skips, 18.05 seconds. Exact original JSX fingerprints, locale compaction, dossier/React chunk boundaries, browser candidate/runner and complete-asset budget contracts. No new complete 254-file backend or PostgreSQL run |
| Component tests | Complete 472/472 across 77 files, 115.26 seconds. Includes independent cached dialog modules, exact controlled-field changes, required/disabled submission, pending-close behavior and isolated load failure |
| Selected browser workflows | 11/11 in 50.9 seconds on candidate `2094aaaa12b9cf7a8ba2be2186f50000ec927abb61cdae3fd5286c5481231c6b`. On-demand/delayed/failed financial forms, mobile navigation, draft recovery, bilingual finance, resource approvals, milestones, supplier invoice/payment evidence, credit notes and retained finance workflows. There are now 172 discovered identities; not a full final-candidate browser audit |
| Rendered QA | Existing Playwright workflow because the separate Browser plugin/skill is absent, not because CUA is unavailable. Correct title/meaningful content, no framework overlay, healthy application console in normal flows, scoped axe and containment checks. Desktop 1280x720 and mobile 390x844 screenshots visually inspected. The intentional 503 import test verifies the isolated error rather than claiming a clean failed-download console |
| Measured dialog work | One financial form download across two opens, zero unrelated resource-form downloads, zero ledger writes during input. A 100-character input sequence takes 383.5 ms in this automated observation; not a real-device paint-latency guarantee. One explicit submission retains exactly 1500.25 budget/1600.75 forecast and remains pending approval |
| Startup code | App chunk 519316 -> 496039 raw bytes, 114871 -> 111438 gzip, 91931 -> 89635 Brotli, using the same budget measurement method. Raw reduction 23277 bytes. Financial/resource forms are absent from dashboard and Finance-screen startup reads |
| Production build | Pass: 11.94 seconds in the final browser-run build. Source-bound candidate has 233 built files, 84 runtime files, 220 frontend files and 158 browser files |
| Bundle budgets | Still fail across all 115 JS/CSS assets: gzip 693545/578500, Brotli 603599/540000; client delivery 11202/8500, recovery 4236/4100, case 3938/3000, replacement 1673/1600, actions 1041/900. Aggregate transfer grows by 2635 gzip/3115 Brotli bytes versus Phase 227. No limits raised, omitted assets, renamed surfaces or claim of total-transfer savings |
| Local runtime / release | Existing loopback PID 27296 was observed unchanged. No backend source or operator data changed this phase; the previous policy-blocked API restart remains pending. No new package, provider, deployment, commit/push or independent device/operator acceptance |

Two earlier browser selections are explicitly not green: the first passed nine
cases but its input measurement failed to clear the existing description; the
second passed ten cases but exposed a real 3.77:1 caption contrast failure. The
measurement is corrected, the caption color is fixed, and the same final workflows
pass with accessibility checks still enabled. All evidence paths, lint/source
contract checks and remaining blockers are recorded in the Phase 228 worklog.

### Previous checkpoint - Phase 227

Phase 227 implements a real decoded-image boundary and independently authorized
small conversation previews. Native work, admitted inputs, cache and browser body
reads are bounded. Original evidence/checksums remain unchanged; only explicit
download reads the original. Fast worker-profile initialization no longer
overwrites early edits. Browser verification also found and repaired an undefined
locale in the office photo-selection path; three component regressions cover it.

| Current gate | Result |
| --- | --- |
| Backend scope | 111/111 tests in 17 focused files on Windows Node 22.23.2, no skips, 70.06 seconds. Includes real upload/portal/auth/tamper/quota and runtime-manifest contracts. There are now 253 discovered Node files; no new full 253-file or PostgreSQL round is claimed |
| Component tests | Final complete run: 464/464 across 76 files, 139.23 seconds. The first run exposed an early worker-edit loss; later browser-driven cases reproduced the delivery locale error before its fix |
| Linux native processing | All 12 image-service tests pass with production-only dependencies on Linux musl/Node 22.23.3, one CPU/512 MiB. Official base digest `sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402`; temporary read-only source mount, no ports/provider/operator data. Not an accepted full runtime image or worst-case memory proof |
| Selected browser workflows | 14/14 pass in 1.5 minutes on candidate `7a5b60374c02088e0a450b11bf350c43087f1ed97ac941a4e86abec16ba1ea2a`: private photos, client delivery/review, client and worker offline flows, evidence, survey, registration/placement/release and backup download. One unchanged selection is green; this is not a full 169-case final-candidate audit |
| Rendered photo QA | Chromium 1440x1000 and 390x844: title/content, no framework overlay, application console/page-error checks, scoped axe, layout containment, fixed frames and explicit original download pass. Final photo and delivery desktop/mobile screenshots visually inspected. Browser-plugin skill/runtime is absent; existing Playwright workflow used, not a claim that CUA controls are unavailable |
| Measured photo work | Synthetic 12MP door fixture: 1639591 original bytes, 3082 preview bytes, 12192768 original pixels versus 691200 preview pixels. Zero automatic original reads; one explicit original download has the exact original SHA-256. Separate 12-photo fixture requests six previews, not twelve. These are fixture observations, not real phone-memory or universal speed claims |
| Source contract | Pass: 102 canonical paths, 12 retired paths, 17 hosted keys, 812 source files. Browser identity now includes relative JavaScript test dependencies outside `e2e`, including shared image fixtures; mutation is rejected |
| Dependency audit | Fresh npm audit: zero known vulnerabilities, including development dependencies. Not independent security certification |
| Production web build | Pass: 16.72 seconds in the final browser-run build; earlier builds observed 16.95 and 18.29 seconds. No universal latency guarantee |
| Bundle budgets | Still fail across all 113 JS/CSS assets: gzip 690910/578500 and Brotli 600484/540000. Five surfaces also fail: client delivery 11202/8500, recovery 4235/4100, case 3937/3000, replacement 1672/1600 and actions 1040/900. Compared with Phase 226, totals grow by 1330 gzip and 1110 Brotli bytes; no limits are raised, assets excluded or surfaces renamed |
| Local operator runtime | Existing PID 27296 on loopback port 3002 remains healthy/ready, but has not loaded the new API. The verified-process restart command was rejected by execution policy; no alternate termination or lock bypass was attempted. Frontend `dist` is current; small server-generated previews require the pending API restart |
| Recovery before restart | Normal signed backup creation correctly rejects the missing signing key. A separate private maintenance checkpoint uses Node SQLite's online-backup API, passes SQLite integrity/foreign-key checks, and retains company/evidence binding plus an operational export. All six retained file hashes verify. It is not a signed product restore package and no signing key was invented |
| Package / provider / release acceptance | No new accepted Windows package, complete runtime image, real phone, live provider, EU infrastructure or independent operator acceptance. Seven bundle gates and the active production-readiness goal remain open |

The first 14-case selection returned 12 passes/two failures (delivery locale and
an offline-photo observer matching only URLs without a query). After repair, a
second selection returned 13 passes/one measurement failure: attempting to fetch
the rendered blob was blocked by the existing `connect-src` CSP. The accepted
test instead observes the application's existing `Response.blob()` result,
requires a nonempty preview with matching HTTP byte length, decodes it and checks
its format/dimensions. No CSP relaxation or additional authenticated refetch was
introduced. Playwright tracing itself can perform CDP empty-body fallback reads
without bearer headers; these receive 401 and are not application file downloads.
Zero-body measurements from the first attempt are rejected, not used as savings.

Long-timeline retained browser previews, worst-case pixel-limit load, real phone
memory, full current backend/browser coverage and aggregate frontend bytes still
need work. Full lint/whitespace final outcomes and exact evidence paths are in the
Phase 227 worklog.

### Previous checkpoint - Phase 226

Phase 226 removes the React-to-entry chunk cycle and verifies cache stability
with two actual Vite builds of a changing screen. The production build succeeds
without the former circular-chunk warning. Nine PostgreSQL integration setups
now release a client when connection or TLS verification fails before teardown
registration. TLS verification is not weakened; a real plaintext negative test
rejects the connection and exits normally rather than leaving its socket open.

| Phase 226 gate | Result |
| --- | --- |
| Backend coverage | All 252 discovered files covered in two stages: 236 isolated files pass 1024 tests, then 16 serial PostgreSQL files pass 109 tests, both without skips. The original combined invocation was stopped at a failed, leaked plaintext fixture connection; it is not reported as a green combined command. PostgreSQL setup/cleanup and its tests were repaired before the accepted serial stage; production backend sources remained unchanged |
| PostgreSQL environment | Disposable loopback database, one-day local CA certificate, `sslmode=verify-full`, certificate and hostname verification, no persistent mounts; TLSv1.3 observed. Object storage remains a local test double; container stopped after verification |
| Component tests | Fresh complete run: 450/450 across 75 files, 105.90 seconds |
| Lint / source contract / whitespace | Full lint and diff check pass; source contract: 101 canonical paths, 12 retired paths, 17 hosted keys, 807 source files |
| Dependency audit | Fresh npm audit: zero known vulnerabilities, including development dependencies; not independent security certification |
| Full browser audit | All 168 discovered identities execute exactly once in 42 batches against candidate `407c89df113904ef7cb16c2ce69fbee7d739df6f7fe441e4561688fa002363bf`: 167 pass, one help test fails because the preceding case retains Dutch and the test assumes an English label. The start selector is repaired without resetting preferences; the same four-case sequence passes 4/4 on final candidate `df05a53d4c7adb60fece19cd2ba1b574aad2310fe81e20236dc1fcb12123c8eb`. Build, runtime and frontend candidate records are identical; only browser tests differ. This is broad coverage plus a targeted final-source rerun, not one green 168-case final-candidate invocation |
| Rendered help QA | Existing Playwright workflow; 1440x960 desktop and 390x844 phone. Page title, meaningful content, language values, topic expansion, search, containment, scoped accessibility and no page errors pass. Final screenshots visually inspected; phone assertion waits for the navigation's real hidden state after resize, rather than capturing the CSS transition |
| Production build | 287 modules, 15.06 seconds in one observed build; browser runner rebuild 15.13 seconds. Neither is a universal speed guarantee |
| Bundle budgets | Still fail: gzip 689580/578500 and Brotli 599374/540000; five surface gates also fail. Reduction from Phase 225: 763 gzip and 655 Brotli bytes; no limits raised, assets omitted or surface renamed |
| Package / container / live acceptance | No new accepted Windows package, runtime image, provider, EU infrastructure or independent device/user acceptance |

Phase 224 reduces redundant draft-storage work; Phase 225 defers offscreen
private photographs and preserves fixed preview frames. These are measured
resource improvements, not proof that maximum performance has been reached.
See `CODEX_WORKLOG.md` for exact evidence paths and the completed browser result.

## Historical working tree - 2026-10-01

**Release status: blocked.** The August results below are historical and do not
approve the current working tree or its generated Windows packages. The active
objective remains production readiness; no commit, package promotion, deployment
or managed-provider acceptance is recorded by this update.

Phase 205 adds staged Windows packaging, per-asset source/Brotli hashes,
required-surface checks and structured failed-budget reports. Phase 206 resolves
named icon imports directly from the installed package's export map; the build
graph drops from 1740 to 252 modules. One private comparison measures 17.67
versus 14.85 seconds, not a universal speed guarantee. A current real Windows
rejection drill preserves the previous target and all 191 canonical web-output
files, including hashes and modification times. The Phase 205 Docker attempt
failed before building (worker-list HTTP 500); Phase 206 actually builds the UI
and is rejected by the unchanged budget gate. That proves rejection, not runtime
image acceptance or deployment readiness.

| Current gate | Result |
| --- | --- |
| Local Node tests | Phase 211 focused: 68 passed, no skips; the JSX equivalence suite also passes 12/12 with NODE_ENV=production; Phase 207 full baseline: 1005 total, 957 passed, 48 environment skips; no fresh full Node/PostgreSQL/provider acceptance |
| Component tests | Phase 211 final normal-settings run: 314 passed across 60 files, including eight new safety-status regressions; 140.39 seconds |
| Lint and source release contract | Phase 211 final full lint passed; 101 canonical paths, 12 retired paths, 17 hosted keys, 748 source files |
| Dependency audit | Phase 207: zero known vulnerabilities; not an independent security certification |
| Broad browser audit | Phase 211 complete attempt: 151/152 passed, every case executed exactly once on one unchanged candidate; the mobile stop-work confirmation exceeded its assertion deadline. Later source-bound safety selections pass, but do not constitute a full green final 152-case run |
| Current web build | Phase 211 passed: 254 modules, 19.34 seconds; this is one build measurement, not a general speed guarantee |
| Bundle budgets | Phase 211 failed: gzip 676761/578500 and Brotli 586138/540000 bytes across all 97 assets; five surface limits also fail, with unchanged limits |
| Windows rejection drill | Phase 206 passed: old target, default manifest and 191 served files preserved; no new package promoted |
| Docker attempt | Phase 206 UI build succeeds and enforced budget check rejects it; no current runtime-container acceptance |

## Phase 211 React equivalence and field-safety history

Production JSX now imports cached bindings to the actual installed
react/jsx-runtime functions, including React.createElement for the compiler's
key-after-spread fallback. Development keeps the standard automatic runtime.
The virtual module resolves only its exact two public IDs, is included in the
measured React asset, and does not read arbitrary source paths. Nine fixtures
compare props, keys, fragments, event/ref identities, escaped markup, local
binding collisions and function defaultProps. A classic-runtime experiment is
rejected after the tests expose a real React 19 defaultProps behavior difference;
its larger transfer saving is not adopted.

Against Phase 210, the largest JavaScript asset drops from 591432 to 573176
bytes. Final aggregate savings are only 2006 gzip bytes and 1199 Brotli bytes.
All 97 assets, required surfaces and verified Brotli/source identities remain
counted. No threshold is raised, surface renamed or asset excluded. The five
failed surface measurements are client delivery 8535/8500, operational recovery
4180/4100, recovery case 3875/3000, replacement 1672/1600 and actions 1043/900.

The broad browser run executes all 152 identities exactly once in ten batches
on candidate
`d8513b2cad39696dea24d0bc901a388adf7feec58aef1b489cc9ff26cca5094d`.
Coverage is valid, but the result is 151 passed and one failed, not acceptance.
The failed trace shows a stop-work POST returning 201 after 10345.735 ms,
past the unchanged 10000 ms visibility assertion. Its response has outcome
stop_work, readyForHazardousWork=false and stopWorkImmediate=true. The captured
screen contains the retained second assessment. An isolated unchanged-candidate
recheck passes; this is not proof of a latency fix or adequate load margin.

Visual inspection exposes an expired caption next to a current stop-work
record. Six initially red component cases require clearer current/historical
captions, while two ready-state cases already pass. Stop-work evidence now
requires reassessment even after its time window; superseded assessments have
an explicit history caption. A later two-case red test also exposes an English
stop-work badge in Dutch, corrected without changing retained outcome values.
The eight final regressions pass. A real browser axe check then reports
color-contrast failures on the safety rows. Only their text color is darkened;
no accessibility rule, business assertion or timeout is relaxed.

An initial overlapping component/browser attempt has a supplier-form timeout
(305/306); a single-worker full repeat passes 306/306. After the status changes,
a normal full run passes 314/314, an intermediate repeat has a position-refresh
failure (313/314), and its focused 20-case recheck passes. The final normal full
run after the badge translation passes 314/314 in 140.39 seconds. These timing
observations are retained as residual test/load-margin risk, not a claimed
production performance improvement.

The first post-contrast 16-case selection passes with exact coverage on
`e6620e9c51b451e795b690402427b4b5c2de26b27e6c1826e8054550a533a002`
under TEMP/contractor-ai-phase211-final-safety-M5xgCo. The subsequent badge
translation changes the candidate; that earlier selection is not final-source
acceptance. The final candidate is
`18cd4a74fbfdd0fb5d58893032e4f46cfe310672be9cfb396884084871c0d5d3`.
Its source-bound first 16-case selection passes exactly once in 2.5 minutes
under TEMP/contractor-ai-phase211-accepted-safety-WlXs5z. This recreates the
original failing group context and additionally checks Dutch/English safety
captions, the translated stop-work badge, superseded history, mobile containment,
page errors and selected safety-row WCAG rules. The source/build remains
unchanged before and after the selection. The final mobile NL/EN and desktop NL
row screenshots are visually inspected: meaningful content, legible captions
and no clipping or overlapping text. They are scoped safety-row evidence,
not a full visual or independent accessibility audit.

Repository Playwright, installed React tooling and local source checks are used;
the Browser plugin/skill is absent, not all browser-control capability. Reports
and screenshots are retained outside the repository. No operator data reset,
commit, push, package promotion, hosted deployment or live-provider activation
is performed. Full final browser acceptance, substantial aggregate bundle
reduction and external production acceptance remain open.

After the reporting edits, the final browser candidate hash and complete bundle
report are reverified unchanged; diffcheck passes. Port 3002 returns HTTP 200
with title Contractor.AI and local readiness reports ready, SQLite, loopback-only
exposure and verified private evidence storage. This is local readiness, not
hosted production readiness. All verification processes owned by this phase
have completed; the existing local application is left running.

## Phase 210 recovery-command safety

Four new component regressions first reproduce supplier-form loss during a
parent write, missing exact retries for actual-cost allocation/reversal, and a
stock retry bypassing withdrawn edit rights. They pass after the fixes. Six
recovery forms share a synchronous lock, pending-command retention, definitive
rejection handling and permission checks. Supplier panels no longer destroy a
mounted form on temporary write-lock changes or collapse. Successful-request
callback failures are not classified as uncertain ledger writes.

The broad browser attempt exposes editable cash-flow defaults before the first
forecast arrives: its trace records a recalculation with openingBalance=0 after
filling 2500. A further red component test reproduces the unsafe initial screen
and NaN totals. The control now exposes only a loading state until real forecast
data exists. The unchanged business-value assertions pass in both final browser
runs, with no release threshold relaxed.

The final ten-case browser selection verifies cash-flow approval/archive,
contract dates, offline worker instructions and resumption, cross-job worker
replacement, supplier response, appointment review, combined case closure and
actual-cost replay. It is bound to candidate
`d19969acc4595b8214389357c3d9dd8108113b13f0ddd23863991591574843ea`
and records exact coverage under
`TEMP/contractor-ai-phase210-recovery-final-Hm6Bav`. A real test-ledger cost write
is committed and its HTTP response deliberately lost; after reload the identical
request returns replayed=true and the ledger still contains one allocation.
Selected axe checks, containment, page identity, meaningful content, no framework
overlay, and page/console health pass on desktop 1440x1000 and mobile 390x844.
The intentionally aborted request's ERR_CONNECTION_RESET is expected, not an
unexplained console error. The repository Playwright runner is used because the
Browser plugin/skill is absent; screenshots are outside the repository.

Full component tests pass 306/306, focused Node checks pass 56/56 without skips,
and full lint, diffcheck and source contract pass. Local readiness on port 3002
reports HTTP 200, local SQLite, loopback-only exposure and verified evidence
storage. No operator data was reset, server deployment changed, external channel
enabled, or commit/push made. The interrupted broad attempt is not a green run.
No new full Node/PostgreSQL, package, container or live-provider acceptance is
claimed. Full final browser coverage, material aggregate bundle reduction and
production acceptance remain open.

The cash-flow correction preserves edited inputs and rejects superseded reads;
five new regressions plus the two existing finance tests pass 7/7. The first
focused browser recheck passes the original four-case group but fails the adjacent
finance accessibility check on table-date contrast. Table secondary text is now
darker; the next rebuild/recheck passes all five cases without excluding any axe
rule. Cash-flow checks include hovering a week row and waiting for mobile-menu
visibility to settle. The final desktop/mobile screenshots show the retained
2500 opening balance without overlapping navigation; page identity, content,
no framework overlay, no console/page errors and approval/archive interactions
are verified. Repository Playwright is used because the Browser plugin/skill is
not available. A focused green recheck cannot replace a single green final broad
audit. Local readiness on port
3002 reports configuration/database ready and evidence storage verified; that is
not EU production or managed-provider acceptance. Current phase evidence and
remaining requirements are tracked in `CODEX_WORKLOG.md` and
`GOAL_COMPLETION_MATRIX.md`; pending checks are not successful checks.

Phase 206 browser coverage includes all twelve primary owner workspaces,
representative dialogs, mobile navigation/client portal, offline client photo
and message synchronization, worker registration, scoped field-task completion,
and cash-flow approval/archive. The new icon test initially reads navigation
before actor loading finishes; waiting for Finance to be enabled fixes this
test synchronization issue. The original four-case group passes on recheck.
Its final visual check waits for the daily workbench as well and verifies
visible icon geometry, desktop/mobile content, page identity, no framework
overlay or console/page errors, and actual navigation interactions. Playwright
screenshots remain outside the repository; the canonical local ledger was not
reset. Gzip is slightly larger than Phase 205 despite the smaller build graph;
the size gate is explicitly not cleared.
The final import boundary restricts rewrites to actual `./icons/` exports,
retaining helper APIs as well. Its 20 import/catalog/budget tests pass again;
the final rebuild's complete measured report and all 94 source/Brotli asset
hashes match the browser-tested build. Ordinary builds measure 15.42 and 18.75
seconds under differing local load/cache conditions; no guaranteed build-time
improvement is claimed.

## Phase 207 verification

An interrupted replacement request is retained in the existing operator- and
source-bound session draft. Inputs and new submissions stay disabled until the
same request is retried or a confirmed rejection permits correction; a
synchronous lock also prevents overlapping submissions. Read-only, closed,
cancelled and stale recovery cases cannot initiate these child actions. The
existing API replay is checked against the identical approval and plan IDs.

All 280 component tests in 56 files and nine focused Node/API checks pass.
The final full Node 22.23.2 run passes 957 tests with zero failures and 48
environment skips (1005 total; 647.70 seconds). It does not constitute a new
PostgreSQL or live-provider run. The final stricter browser recheck also binds
the sole failed network request to the deliberately aborted replacement URL
and requires exactly one expected console error, before and after reload.
Nine recovery/availability browser cases execute exactly once and pass, with
valid coverage. A final visual/reload check passes 1/1. It allows the real server
to retain a plan, deliberately loses the response, then proves the identical
retry leaves one pending approval and preserves the original assignment.
The persisted approval remains visible after reload. Desktop 1440x1000 and
mobile 390x844 show the frozen retry controls and the retained approval with
no horizontal page overflow. Recovery-surface axe checks have no violations
or exclusions. Page identity/content and absence of framework overlays are
checked; the deliberately induced network error is explained and no other
console/page errors occur. Browser plugin/skill is absent; repository Playwright
is used with isolated runtimes, not the operator ledger. Evidence is under
TEMP/contractor-ai-phase207-* and contractor-replacement-recovery-*.

The private shared-input experiment is rejected: 587 conversions reduce gzip
by only 109 bytes but increase Brotli by 80 bytes. Its helper, tests, codemod and
explicit dependency are removed; neither large screen is rewritten. The final
functional build processes 252 modules in 15.69 seconds. The safety fix adds
153 aggregate gzip bytes and 144 Brotli bytes versus Phase 206; no download
improvement is claimed. The unchanged budgets remain red. No Windows package,
runtime image, deployment or live-provider acceptance is promoted. Local port
3002 readiness still reports configuration/database ready and evidence storage
verified. The full 152-case browser inventory has not had a green final run.

## Phase 208 verification

Drawing, SDS and submittal downloads share one verifier with an approved-size
byte buffer rather than retained stream chunks plus a second buffer. The checks
still bind encoded job/document/source routes, redirects, timeout, HTTP/MIME,
PDF signature, SHA-256 and file/pack limits. Stream locks are released even when
reading or cancellation fails. Offline saving has a synchronous single-flight
lock and freezes its passphrase; failed downloads or changed sources do not save
a vault. The existing role/company scope and source recheck remain intact.
Four missing Dutch technical-PDF labels are translated.

The online pack no longer eagerly imports the PDF or vault modules. Browser
network observations prove neither is requested merely by opening the pack,
the PDF module is loaded for an individual download, and the vault module waits
until an offline save. This is an actual loading boundary, not exclusion from
aggregate accounting: all 96 built JS/CSS assets remain budgeted. The private
refactor-only build saves just 38 gzip bytes and adds 32 Brotli bytes; the final
functional increment adds 1081 gzip and 1149 Brotli bytes versus Phase 207.
No aggregate download improvement is claimed.

The final full component suite passes 287/287 across 57 files. The focused Node
group passes 43/43 without skips, covering all three document kinds, stream
failures, combined limits, encrypted vault behavior, scoped work-pack API,
company requests and offline-shell selection. This does not refresh the entire
Node/PostgreSQL/provider suite. Twelve selected browser identities execute once
across three groups and all pass. The strengthened offline scenario creates
three real retained/approved PDFs, verifies online SDS/submittal download bytes,
then reopens the encrypted folder offline and verifies all three downloaded
files byte-for-byte. One retained offline question synchronizes once; expiry
removes document access. Company isolation, client photos/replies, governed
documents and operational recovery also pass on this unchanged built candidate.

Desktop 1440x1000 and mobile 390x844 screenshots were viewed outside the repo.
Page identity, meaningful content, absence of framework overlays and relevant
console/page errors, real interactions and no horizontal overflow are checked;
offline-page axe checks pass without exclusions. Browser plugin/skill is absent,
so repository Playwright uses isolated ledgers rather than operator data.

Build passes with 252 modules in 15.51 seconds; lint, diffcheck and release
contract pass. The unchanged aggregate gates and five surface gates still fail.
The full measured report, including all source/Brotli hashes, has SHA-256
`a0d9e674c3e04188355b0f7b924861a346b95f11565e910e142d77a49560872d`.
Readiness on port 3002 reports local configuration/database ready and evidence
storage verified. No operator reset, package promotion, accepted runtime image,
commit/push, deployment or provider action occurs. The full green final browser
audit and production acceptance remain open. Evidence:
TEMP/contractor-ai-phase208-*.

## Phase 209 verification

The standard browser runner builds once and binds all 195 served files, 83
packaged runtime/closure files, 179 root/component application sources and 93
browser/test sources. Every batch verifies the candidate before and after
execution; mutation, missing/added files, links and empty batches fail closed.
Artifacts default to a system TEMP directory, not the product repository.
Packaged documents are bound too; only unpackaged notes and private live state
are excluded. These fingerprints do not attest installed dependencies or approve
a release, provider or deployment.

The Playwright child inherits only allowed platform/browser/CI settings. Both
servers force local loopback SQLite/filesystem operation and disable scheduler,
AI, WhatsApp and live weather. Operator credentials, private paths, hosted
storage/database, shared identity, proxies and Node preloads are not inherited.
The full audit runs with synthetic hosted/S3/database/identity settings and
enabled external-channel flags in its parent; real operator records are not used.
This is environment isolation, not a general network sandbox.

An early eight-case run is correctly rejected when the runner changes. A second
full run executes 152 cases, with one English-icon assumption failing after a
preceding test retains Dutch. An isolated two-case run reproduces it; explicit
locale setup after actor readiness fixes it. Three repetitions and the wider
five-case group pass 11 checks. A subsequent 40-case run is correctly rejected
when this agent edits a packaged document; the documentation and regression now
distinguish packaged guidance from unrelated notes.

The final broad audit executes all 152 exact identities once in ten bounded
groups with valid coverage on candidate
`fbeac39814e6c96a027b928ea96d639e9470f9deb69fb90c1ac0b0d410d2b303`.
151 pass. The sole failure expects a missing-check-in review on the first page
of 156 matching actions. Trace responses show the retained high-priority warning
in the dashboard, but not in the first twenty displayed commands. The corrected
test uses the real worker search and retains the explicit human confirmation
and no-duplicate assertions. The entire affected sixteen-case group passes once
with valid coverage on candidate
`e5ac104a7705f7ea5e652066f0a5da8e06e56fdcc4c4b3650722e480560be0ed`.
All built files, runtime files and application sources match the broad candidate
byte-for-byte; browser-test sources differ. These results are not combined into
a fictitious green full run. A final full-suite run remains required.

All 42 focused Node checks pass without skips in 9.63 seconds: 36 runner/candidate
checks and six daily-cycle checks. The new busy-queue regression retains a
source-bound overdue check-in review with 24 other jobs, more than twenty
matching commands and a bounded monitor, then finds it through worker search.
No absence is inferred. Full Node, PostgreSQL and component suites are not
refreshed in this phase; the component implementation/build bytes are unchanged.
Full lint and final changed-source lint, diffcheck and source contract pass.
The complete bundle report and all 96 JS/CSS source/Brotli hashes still match
the Phase 208 report identity above; the unchanged size limits remain red.

CI now supplies its runner temporary directory to the browser command and has
an always-run artifact upload for the resulting candidate, summary and contained
failure/screenshots/traces. A source-contract test checks that wiring. No live
GitHub Actions run or artifact publication was triggered; this is locally tested
configuration, not remote CI acceptance.

Desktop 1440x1000 and mobile 390x844 offline/document and icon screenshots were
viewed outside the repository. Page identity/content, relevant interactions,
no framework overlay or unexpected scoped errors, mobile containment and selected
axe checks remain covered. Repository Playwright is used because the Browser
plugin/skill is absent; this is not screen-reader/device/operator acceptance.

Port 3002 was no longer listening. Before starting the existing local development
entry point, a consistent SQLite snapshot was saved under ignored
`data/release-backups/phase209-operator-before-start-1790841885660.sqlite` and its
SQLite integrity check returned `ok`. This is not an encrypted, signed or complete
database-plus-evidence recovery proof. The restarted loopback-only local runtime
returns HTTP 200 for the built shell and readiness, with SQLite/evidence ready,
valid ledger, schema `095_field_reply_notifications` and no pending migrations.
No operator reset, commit/push, package promotion, accepted container, provider
action or deployment occurred. Evidence: TEMP/contractor-ai-phase209-* and
TEMP/contractor-ai-browser-results-B3l6cp; the app remains available on port 3002.

## Historical verification snapshot - 2026-08-15

Report date: 2026-08-15
Release candidate: `1.1.0`
Starting revision: `210c2673ebcd70f681f401650ec7cccf2d81406b`
Release revision: the Git commit containing this report; record the resulting SHA
in the release or deployment record.

## Scope

This report verifies the local-first release candidate and repository delivery
contract. It does not attest to credentials, contracts, infrastructure, or legal
decisions outside this repository.

## Automated results

| Gate | Result | Evidence |
| --- | --- | --- |
| Lint | Passed | `npm run lint` |
| Dependency audit | Passed | `npm audit --audit-level=low`: 0 vulnerabilities |
| Release contract | Passed | `npm run verify:release`: 69 canonical paths, 12 retired paths, 16 hosted keys, 348 canonical source files; generated release/runtime/artifact directories excluded |
| HAI input contract | Passed | Native verifier and maintained HAI parser accepted the checksummed `accountfeed.GenericItem` review-only feed with `canExecute=false`; direct local publication read the atomic file back successfully, while live HAI registration/polling was not configured |
| Frontend tests | Passed | Vitest 4.1.10 with Testing Library: 3 files, 11 locale/component tests, 0 failed |
| Node tests | Passed | Isolated suite: 555 tests, 519 passed, 36 PostgreSQL/environment skips, 0 failed, 330.0 s |
| Production build | Passed | `npm run build`: largest application JS 548,446 bytes and CSS 275,210 bytes before gzip; the specialist operator catalog remains demand-loaded only when Dutch is active |
| Bundle budget | Passed | `npm run verify:bundle`: largest JS 548,446 bytes, largest CSS 275,210 bytes, and 462,645 total gzip bytes across 39 assets; all budgets passed |
| Production-scale ledger | Passed | The retained deterministic 63,500-row profile passed its correctness/resource/latency thresholds in an uncontended run: dashboard p95 0.44 ms, canonical intake p95 66.49 ms, startup 1,017.45 ms, reopen 9.55 ms, seed 1,562.75 ms, and audit verification 301.45 ms. |
| Browser tests | Passed | All 101 Playwright Chromium workflows passed on current source in 26 bounded isolated batches |
| Accessibility gate | Passed | Pinned `@axe-core/playwright` 4.12.1 scanned production sign-in, all twelve owner workspaces, representative dialogs, mobile navigation, and mobile/desktop client portal surfaces with zero selected WCAG A/AA violations and no rule or component exclusions |
| Container runtime | Passed | `npm run test:container`: non-root, read-only, loopback, authentication, SQLite volume persistence, restart persistence, graceful shutdown and migration 072 smoke |
| Local runtime | Passed | Node and browser gates each served the current production build from isolated local runtimes; public readiness, authenticated session, persistence, and graceful shutdown probes passed |
| Windows standalone | Passed | Bundled Node 22.23.2 passed authenticated isolated-profile startup, migration 072/zero pending, redacted owner register, privacy register, atomic HAI publication, and the packaged ngrok lifecycle with anonymous rejection, authenticated readiness, verified state, and ingress-first shutdown |
| PostgreSQL parity | CI service gate | Migration 072 operator preferences and the shared ledger contract tests are present; 36 PostgreSQL/environment tests were skipped without local provider services |

## Manual results

| Check | Result |
| --- | --- |
| Desktop owner critical-path rendering | Passed in automated Chromium workflow suite |
| Mobile field workflow rendering | Passed in automated Chromium workflow suite |
| Four-step owner onboarding | Passed in Dutch from a fresh ledger at 390x844 through persistent server readiness, exact API identity, retained desktop Operations values, and an English round trip |
| Safety stop visible and controls disabled | Passed in automated Chromium and Node tests; packaged UI verifies focused heading, decision context, disabled incomplete submission, Escape close, and initiating-focus restoration |
| Support bundle and doctor | Passed against an isolated local production runtime |
| Local backup/restore UX | Passed in browser and backend contract tests |
| QA/demo maintenance | Passed for localized preview, complete unbounded selection, deterministic plan hash, stale/empty rejection, verified backup, atomic archive/retirement and approval rejection, retained non-QA records, audit reason/hash, successful focus restoration, and responsive empty state |
| Managed team access | Passed for localized owner-only account creation, one-time key presentation, rotation, immediate session revocation, deactivation, API redaction, canonical role/status retention, and mobile containment |
| HAI local-feed lifecycle | Passed for owner-only status, disabled unconfigured UI, atomic publication, read-back contract validation, SHA-256 status, NL/EN round trip, non-owner rejection, Windows package output, accessibility, and zero execution authority/external commitments |
| ngrok lifecycle | Passed against a controlled edge and real production runtime for local database/storage readiness, anonymous `401`, owner-authenticated readiness, exact public origin, loopback binding, pending-to-verified state, bounded responses, startup cleanup, ingress-first shutdown, and duplicate-stop idempotency |
| Governed framework lifecycle | Passed across catalog, 23 family playbooks, guarded starters, API, SQLite, restore, export, HAI, desktop and mobile tests |
| Privacy rights lifecycle | Passed for request registration, minimal identity reference, deadline extension, source-current assessment, independent approval, restriction/objection guards, rectification, partial pseudonymisation, private JSON export, recovery, and desktop/mobile layout |
| Material, safety, permit and LMRA load races | Passed with job-scoped sequence guards and disabled form controls |
| Audit actor integrity | Passed for authenticated role principals, scoped client portal identity, and local `local:owner`; all explicit mutation sites plus 65 former workflow-label fallbacks consume the trusted principal directly. Approval and authoritative operational provenance preserve that principal through retained decisions, downstream releases, chained history, and separation-of-duty checks. NCR closure retains both named and authenticated verifier identities and rejects self-approval. The release contract rejects body-derived actors, fallback routes, and submitted-first approval or operational principals |
| Work-permit timing integrity | Passed with creation, readiness, and approval expiry bound to the injected ledger clock; deterministic expiry tests retain fail-closed approval behavior without wall-clock sleeps |
| Draft recovery | Passed for reload restoration, operator isolation, portal-token fingerprinting, expiry/size bounds, secret/file exclusion, logout and intentional-close cleanup, no implicit ledger write, and explicit job-workspace navigation |
| Workforce and work permits | Passed in Dutch and English through crew creation, assignment approval, qualification evidence approval, availability, permit approval, worker acknowledgement, stop-work suspension, closeout, exact retained API evidence, accessibility, and mobile containment |
| In-app Browser QA | Passed against the current built runtime: persisted NL shell rendering, localized currency, compact navigation, no horizontal overflow, and a clean inspected error log; business identity/onboarding, managed team access, autonomous safety, QA maintenance, ICP/service-area, bid/no-bid, WBS/quantity takeoff, labour-burden/overhead/unit-rate estimating, commercial scope/allowances, project risk/premortem, fixed-price-versus-regie decisions, estimates and formal variations, job setup coverage, critical-path work planning, crew-capacity/two-week planning, daily start/EOD reporting, production baseline/output/reversal, regiewerk quantity/acknowledgement/conversion, Last Planner, 5S, LMRA, installation/QC inspections, before/during/after photo evidence, NCRs, field observations/incidents, field assurance review, punch/warranty/aftercare/feedback closeout, client-success handover, and 13-week cash-flow controls render in Dutch. Retained operator evidence remains verbatim across locale changes, while the complete portal, Performance Scorecard, Framework Register, site-survey, and practical-core persistence flows passed in Playwright. |
| In-app Browser draft QA | Passed against the current built runtime: an unfinished opportunity restored exact values after reload, an intentional close cleared it, and no visible error state remained |
| Responsive evidence | Desktop and narrow-screen geometry was inspected in prior in-app browser passes; owner administration, job summary, field-assurance, finance, procurement, equipment, workforce, permit, and HAI controls retain mobile containment with localized label wrapping, and 101 automated workflows retain repeatable desktop/mobile interaction evidence. In-app local navigation remains blocked by Browser URL policy in this environment; the isolated production-browser harness passed the same built application. |

## Confirmed limitations

- No real external messaging, accounting, calendar, mapping, banking, Peppol, or AI
  provider has been enabled by this repository-only pass.
- EU hosted production remains blocked until an operator supplies and verifies the
  provider, region, DPA, ingress, database, object storage, backup, retention, and
  recovery requirements described in `EU_HOSTING.md`.
- The operator shell, complete client portal, Performance Scorecard, Framework
  Register, ICP/service-area, bid/no-bid, site-survey, WBS/quantity takeoff,
  labour-burden/overhead/unit-rate estimating, commercial scope/allowances,
  project risk/premortem, fixed-price-versus-regie decisions, estimates,
  quote acceptance, formal variations, job setup coverage, critical-path work
  planning, crew-capacity/two-week planning, daily
  start/EOD reporting, production baseline/output/reversal, regiewerk
  quantity/acknowledgement/conversion, Last Planner, 5S, LMRA, installation/QC
  inspections, before/during/after photo evidence, NCRs, field observations and
  incidents, assurance review, punch/warranty/aftercare/feedback closeout,
  client-success handover, job costing, cost-code review, cost-to-complete,
  source-linked forecast warnings, finance readiness, 13-week cash-flow controls,
  bid-package comparison, preferred-bidder selection, purchasing commitments,
  immutable purchase-order packages, verified provider receipts, business
  identity/onboarding, managed team access, autonomous safety control, QA archive
  maintenance, workforce directory, qualifications, availability, governed work
  permits, equipment
  registration, inspection, maintenance, physical custody, quarantine return,
  and approval-gated retirement now have
  persisted NL/EN presentation with locale-aware dates, numbers, and currency.
  Translation of the remaining specialist operator workspaces, universal
  component-internal draft recovery, and uniform pagination remain partial.
- The ngrok launcher now verifies the complete authenticated public-edge lifecycle
  before announcing success, including in the Windows package. No live tunnel was
  opened because no `NGROK_AUTHTOKEN` and operator-controlled edge were available;
  the controlled-edge test is not presented as live ngrok-provider acceptance.
- The HAI connector is read-only, downloadable, and can atomically publish to an
  operator-configured absolute local-feed path. Its output is accepted by the
  maintained HAI generic-feed parser. Actual HAI feed registration, polling, and
  owner mapping were not available for live acceptance; neither side receives
  authority to mutate Contractor.AI records or create external commitments.
- The product supports compliance evidence and review gates but makes no legal or
  certification claim.
- Automated accessibility checks do not replace representative keyboard,
  screen-reader, zoom/reflow, or Windows High Contrast user acceptance.

The performance gate retains a disposable deterministic production-scale fixture,
historical-search and full-aggregate correctness checks, resource and latency
thresholds, and a CI report artifact. The current production profile completed the
representative dashboard at 544.75 ms p95 and a canonical intake at 44.46 ms p95
while preserving the prior query and assembly optimizations.

The publication record must add the pushed commit SHA and GitHub Actions run URL.
No repository-only test can replace provider, infrastructure, DPA, recovery, or
independent operator acceptance evidence.
