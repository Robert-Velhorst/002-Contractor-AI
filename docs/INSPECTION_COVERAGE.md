# Inspection Coverage

Migration `080_inspection_coverage` connects a reviewed list of required checks
to one retained partial work delivery. A passed inspection alone does not say
that every required check for that delivered portion has been performed.

## Office Workflow

1. Retain the actual executed portion in **Deelopleveringen**. Unfinished work
   stays outside that portion; do not describe an entire unfinished job as done.
2. In **Keuringsdekking**, choose **Controleplan opstellen** for that portion.
   Describe its precise inspection scope, acceptance criteria and required checks.
   Each check has a separate title and instruction that will be shared with the
   assigned workers. Internal criteria and review references remain office-only.
3. Declare whether evidenced non-applicability is permitted for each check.
   It is disabled by default. A plan contains one to fifty checks and an explicit
   declaration that the list covers this described portion. The software does
   not derive that declaration from the list length or an AI suggestion.
4. Submit the plan to **Goedkeuringen**. A different authenticated operator must
   approve it. An owner cannot bypass this separation by supplying another name
   in the request. Existing owner/approver permissions still apply.
   This checks distinct authenticated principals, not physical identity or
   professional competence. Operators must not share credentials or treat two
   role tokens as proof that two different people performed the review.
5. Create and review the actual inspections through the existing inspection/QC
   workflow. Then choose **Bewijs per controle beoordelen**, map every planned
   check to an approved inspection and a retained source document, and explain
   specifically how that evidence covers this delivered portion.
6. A permitted non-applicability outcome needs a retained source document and
   explicit justification too. It is not a missing inspection treated as passed.
7. Submit the complete mapping for another operator's review. Approval rechecks
   the plan, physical scope, inspection approval, checklist/QC integrity, open
   corrective observations and document metadata. No inspection is auto-approved.

Use separate **inspection_coverage_evidence** documents for private evidence.
Documents must have a stored file or traceable external reference, not only a
title. Execution drawings cannot be repurposed as private coverage evidence.
A drawing reference may instead be described in the scope/criteria, with a
separate retained inspection report. The reviewer remains responsible for
checking that the report and its reference really apply to this work.

## States and Changes

| State | Meaning |
| --- | --- |
| Controleplan ontbreekt | No approved list of required checks exists. No completeness is inferred. |
| Beoordeling openstaand | A plan or evidence mapping awaits review. An older accepted mapping is not presented as current complete coverage during that review. |
| Bewijs per controle ontbreekt | An approved current plan exists, but it has no accepted complete evidence mapping. |
| Scope of bewijs gewijzigd | Physical work, the plan's source or assessed evidence no longer matches the retained basis. |
| Controleplan afgedekt | Every listed check has a current approved evidence mapping or a specifically permitted reviewed non-applicability outcome. |
| Deeloplevering gecorrigeerd | The underlying delivery was corrected and is no longer active. History remains retained. |

**Controleplan herzien** requests a new immutable plan. Approved revisions do not
inherit an earlier mapping, even when some check names are identical. Rejection
retains the old approved plan and, only if still source-current, its coverage.
There is one pending coverage decision per delivery. Rejected/cancelled requests
and superseded plans remain in history; private evidence remains private after
rejection. An approved record is not silently edited or deleted.

Current status is checked on reads as well as approval. A pending correction to
the underlying delivery invalidates reliance until resolved. Historical output,
customer responses and financial settlement are not rewritten by a coverage edit.
Retained approval content must match the decision being relied upon. Superseded
installation-QC references cannot support current coverage even if an earlier
released task is already completed. Refreshing coverage also refreshes the
adjacent delivery overview without discarding an open coverage draft.

## Worker Experience

The assigned worker's online and encrypted offline work pack includes the current
coverage status, approved control titles and explicit field instructions for the
visible delivered portions. It excludes internal acceptance criteria, review
notes, evidence files, inspection identities and approval actors. Old offline
packs without these new fields still render. A downloaded pack is a snapshot:
it cannot learn about a later revocation or change while disconnected, and its
existing expiry and account/company binding remain in force.

## Developer Contract

- `GET /api/ledger/jobs/:jobId/inspection-coverage` returns portion records,
  coverage summaries, immutable decision history, available sources and a
  `sourceHash`. Owner, office and approver may read it; field access is denied.
- `POST` accepts `action` (`plan` or `assessment`), `record`, `entryKey` and
  `sourceHash`. Owner/office may submit; all actors come from authenticated state.
- Both records contain `deliveryId` and `reason`. A plan also includes
  `scopeReference`, `scopeConfirmed: true`, `documentIds` and `checks`.
- Each check contains a unique stable `key`, `title`, `criterion`,
  `fieldInstruction` and explicit boolean `allowNotApplicable`.
- An assessment contains the current `planId` and exactly one response per key.
  Each response has `outcome` (`passed` or `not_applicable`), `documentIds` and
  `scopeReference`. A passed outcome also requires `inspectionId`.
- Exact retries return the retained decision/approval receipt. A reused key with
  changed payload, stale source or another pending review fails with `409`.
  UI forms and uncertain commands are retained while mounted, not on browser exit.
- The existing approval endpoint resolves `inspection_coverage_decision`.
  Approval rechecks locked sources and refuses the requester's own principal.
  Generic role permissions or a field report do not bypass that boundary.
- Two new tables retain decisions and command receipts. SQLite/PostgreSQL native
  company-authority guards apply. Restore verification checks snapshot integrity,
  source/job bindings and approval chains. Hosted import preserves immutable JSON.
- Operational export adds `inspectionCoverage`; full UI export includes private
  office history. Neither export substitutes for a verified database/files backup.
- `WorkDelivery.inspectionCoverage` and its field counterpart carry the same
  current summary; their existing inspection, customer and finance states remain
  independent. Durable dossier review flags `inspection_coverage_incomplete`.

The migration is additive and creates no fabricated coverage for existing work.
Dropping its tables would destroy history; retain post-upgrade evidence and use
a reviewed recovery procedure rather than a destructive downgrade.

## Remaining Boundaries

This is explicit coverage of the operator's approved control plan, not independent
proof that all legal, manufacturer, contractual or professional requirements were
identified. No standards, acceptance tolerances or inspection obligations are
invented. Inspection evidence is still subject to responsible human verification.

Coverage grants no safety permission, commissioning release, client acceptance,
contract closure, payment or external commitment. Pre-execution profile-driven
control planning, complete commissioning/safe-use authorization, client partial
acceptance and the broader work/resource lifecycle remain in
[the total-solution delivery register](TOTAL_SOLUTION_DELIVERY.md).
