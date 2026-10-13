# Ledger Performance Benchmark

The benchmark is a deterministic, disposable release gate for the local-first
SQLite ledger. It does not read, copy, or retain customer data.

## Profiles

| Profile | Retained fixture | Purpose |
| --- | --- | --- |
| `smoke` | 620 jobs, 1,240 tasks, 620 opportunities, 500 approvals, 2,000 audit events | Fast development and Node contract coverage beyond the former 500-row window |
| `production` | 5,000 jobs, 20,000 tasks, 2,500 opportunities, 5,000 approvals, 25,000 audit events; 63,500 core rows total | Release and CI evidence for a mature small/medium contractor ledger |

Both profiles use canonical schema, foreign keys, deterministic identities and
timestamps, and a valid SHA-256 audit chain. The benchmark then performs a real
canonical intake write against the scaled ledger.

## Commands

```powershell
npm run test:performance
npm run benchmark:ledger
npm run benchmark:ledger -- --output artifacts/ledger-benchmark.json
```

The command exits non-zero on a correctness, index, resource, or timing failure.
Temporary databases are removed by default. `--keep` is for local diagnosis only;
never treat the synthetic fixture as an operational backup.

## Contracts

The gate verifies:

- historical job, client, and opportunity search beyond the newest 500 records;
- bounded active-job, opportunity, approval, client, and audit-history responses;
- untruncated opportunity totals and weighted pipeline aggregation;
- required hot-path indexes and complete audit-chain integrity;
- initial startup, scaled reopen, fixture generation, dashboard, canonical intake,
  audit verification, database footprint, and resident-memory growth thresholds.

The production thresholds allow slower shared CI hosts while still catching
unbounded regressions: ordinary reads p95 under 1 second, dashboard p95 under 4
seconds, canonical write p95 under 3 seconds, audit verification under 5 seconds,
database under 128 MiB, and measured resident growth under 512 MiB.

## Current Loading-Read Optimization - 2026-10-03

Phase 244 replaces the loading recommendation's three-way join with independent
counts and indexed existence checks. Migration `096_loading_read_indexes` adds
two job/status/ID covering indexes. Existing scope, statuses, null-ID counts and
the five-job limit remain; equal update timestamps now use ascending job ID.
No external action, cache authority or financial rule changes.

The initial private SQL-prototype comparison copies a retained 5,003-job synthetic
ledger and adds 100 tools, 100 materials and three plans to each of 12 existing
jobs. Both dashboard variants use the same indexes. Twenty measured samples per
variant, after excluded warm-ups, match complete summaries except generated
timestamps: median 780.68 -> 463.76 ms (40.6%). Loading query medians are 259.43 ms
old/unindexed, 203.66 ms old/indexed and 14.70 ms proposed/indexed; index growth is
147456 bytes. This scoped prototype evidence is not a universal speed/RAM claim.
The implemented statement and nextActions behavior pass shared/adversarial local
tests; the subsequent D: measurement was stopped and supplies no final timing.

Current focused Node 15/15, lint, source contract and fresh dependency audit pass.
Current Chromium 15/15 uses the unchanged previous frontend build against the new
backend; no fresh build or full suite is claimed. C: exhausted disk space during
the broad TLS/Node run. D: is exFAT: four link fixtures fail before their assertions;
that broad repeat and a slow production-profile attempt were stopped. PostgreSQL,
NTFS full regression and fresh build/package remain open. Operator PID 27296 is
unchanged. Local evidence is retained under `D:/Contractor-AI-QA-phase244-mlNuU6`.
All 118 existing assets still count: gzip 700819/Brotli 599521; seven original
limits remain failing. No provider, Git or deployment action occurred.

## Retained Build Optimization - 2026-10-02

Phase 243 filters Vite dynamic-import preload lists using only the calling
chunk's exact transitive static imports. No dynamic edge is assumed loaded.
New modules, CSS, unknown paths and HTML preload lists remain unchanged; custom
or disabled preload policies and unsupported/debug outputs bypass filtering.
Compiler version and serialized implementation identity salt affected chunk
hashes before final names. CSS and backend runtime hashes are unchanged.

All 118 JS/CSS assets remain counted, including shared dependencies and verified
Brotli sidecars. Gzip changes 701352 -> 700819 bytes (-533); Brotli changes
599951 -> 599521 (-430). Largest JS is 370088 bytes; CSS remains 245894.
This small aggregate transfer/bookkeeping saving is not a measured navigation
latency or whole-browser RAM improvement. A private graph probe removes 380
redundant references across 86 callbacks, not 380 demonstrated extra downloads.
The first probe lacked cache-policy salting and was never shipped; the product
adds that identity and verifies that changed hashed assets never reuse names.

Focused canonical Node 132/132 and selected Chromium 44/44 pass on the current
candidate; fresh full components 528/528 across 85 files pass in 159.00 seconds.
Cold/warm navigation, delayed/failed form cancellation, rapid input,
bounded photos, authenticated original download, encrypted offline reentry and
sync retain their behavior. Build time is 23.86 seconds. Seven original limits
still fail: gzip 700819/578500, Brotli 599521/540000, delivery 11949/8500,
recovery 4495/4100, case 3957/3000, replacement 1694/1600 and actions 1018/900.
Limits are not raised and features/dependencies are not excluded. No new
backend benchmark is claimed; the Phase 242 runtime proof below is unchanged.

## Retained Count Optimization - 2026-10-02

Phase 242 removes unnecessary DISTINCT work from one-to-one active and capability
counts. Request scopes still deduplicate their one-to-many project join; all
existing scope, null-ID, status and parameter semantics remain intact.

An alternating AB/BA comparison reopens the same retained synthetic ledger with
5,003 jobs. Both variants clear the dashboard summary cache, perform two excluded
warm-ups and collect 20 samples each. The legacy variant reinstates the former
COUNT DISTINCT SQL through a temporary statement adapter. Complete summary
objects match after excluding generated timestamps; the measured loop issues no
business commands. This helper and raw results are retained locally in TEMP
`contractor-ai-phase242-count-ab.{cjs,json,log}`, not shipped as product code.

| Variant | Median | p95 |
| --- | ---: | ---: |
| Former count queries | 567.49 ms | 642.81 ms |
| Optimized count queries | 459.74 ms | 534.15 ms |

The median reduction is 18.99% in that controlled local comparison. It is not a
hosted service level, cross-device result or whole-browser memory measurement.
Independent fresh five-sample production-profile runs have cold summary p95
509.13 ms before and 594.76 ms after; they are not a controlled speedup proof.
The final profile still passes every unchanged correctness/resource threshold:
warm summary p95 0.29 ms, protected summary 2.05 ms, canonical intake 38.43 ms,
audit verification 231.81 ms, database 38.49 MiB and process RSS growth 165.57 MiB.
No reduction in overall RAM or general application latency is claimed.
The final synthetic dataset retains the canonical 5,000 jobs/20,000 tasks/25,000
audit events before the benchmark's three real intake writes.

## Retained Baseline

On 2026-08-09, the packaged Windows Node 22.23.2 runtime passed the production
profile with a 1.51-second fixture seed, 7.05 ms reopen, 620.83 ms dashboard p95,
86.24 ms canonical-intake p95, 352.02 ms audit verification, and about 37 MiB of
SQLite storage. Bounded list/search p95 values were 2.03-23.40 ms except the
approval and audit queues, which remained under 13 ms.

CI runs the production profile and uploads `ledger-performance-report`. Compare
the JSON environment, fixture, p50, p95, response bytes, memory, and disk evidence
before accepting a regression or changing a threshold.

## Hosted Boundary

This gate proves the local SQLite operating mode. PostgreSQL runs the same ledger
contract, migrations, TLS, backup migration, and integration suite in CI, but a
chosen EU provider still requires load and recovery acceptance in its actual
region, plan, ingress, database, and object-storage configuration. Do not use this
local result as evidence for an untested hosted service level.
