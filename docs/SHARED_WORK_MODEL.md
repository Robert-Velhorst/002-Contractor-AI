# Shared Work Model

Implemented foundation for phase 3 of the total-solution scope, at migration
`077_shared_work_context`. This is not completion of the expanded lifecycle;
executed evidence belongs in the delivery register.

## Operator Workflow

Open a job dossier and its **Werkdossier** section. An owner or office operator
can add physical locations, job parties and work packages; an approver can read
them but cannot edit them. Field users cannot read the office context endpoint.

1. Add a site/address, then its building, floor, space, zone or fixed installation.
   A job may reuse a location through the company-wide search. Editing a reused
   location changes the context of every linked job. It does not rewrite the
   original job address or alter a published agreement.
2. Record each involved person/organization with their actual job roles and a
   source/coordination reference. The existing job client is not automatically
   its property owner, resident, payer or decision maker. These roles do not
   grant account, approval or communication authority.
3. Add a package code, outcome, location, instructions, safe stopping point and
   handover notes. Link existing tasks and takeoff measurements. One task or
   measurement belongs to at most one package; edit the earlier link before
   transferring it. Remove a package link before deleting a measurement.
4. A package reaches a worker's online/offline work pack only when it contains
   a task visible to that assigned worker. Other workers' task details and prices
   are excluded. A site contact is shared only through the explicit sharing
   checkbox; private contacts and their role references remain in the office.
5. A work-board position may bind to the reviewed package source. The owner
   still reviews the public terms. Changed package scope, locations or quantities
   stop new placement until the old position is closed and reviewed terms are
   published again. Existing assignments are not silently changed or cancelled.

Archive and restore controls retain records and audit history. An active package
prevents archiving its location link; active links/children prevent archiving a
shared location. Archived packages keep their task/quantity links. Restore the
parent/location link before restoring dependent work.

The office export button downloads the displayed context as JSON. The owner-only
operational export also includes all retained context tables and command receipts.
These exports are for reconciliation, not substitutes for a signed database and
evidence backup. SQLite backup verification and governed PostgreSQL transfer
include the new tables and native authority fences.

## Interfaces and Implementation

- `GET /api/ledger/work-places?search=...&after=...`: company location directory,
  up to 100 returned records per cursor page.
- `GET /api/ledger/jobs/:jobId/work-context`: office context and source hash.
- `POST /api/ledger/jobs/:jobId/work-context`: owner/office command with
  `action`, `record`, `entryKey` and the current `sourceHash`.
- Commands: `save_place`, `link_place`, `save_party`, `save_package`, plus
  `archive_`/`restore_` for `place`, `link`, `party` or `package`.
- A stale source or conflicting replay returns `409`; no automatic overwrite.
  An uncertain network result retains the same command for exact retry.
- The worker-safe projection is `pack.know.workContext` in the existing field
  work-pack contract. Older offline copies without it still render.
- Work-board publication accepts optional `workPackageId` and
  `workPackageSourceHash`, checked against its `sourceTaskIds`. Position reads
  expose `workPackageCurrent`; enrollment rechecks under the same context lock.
- `work-context.js` owns the model and commands. `FieldWorkPack`, `WorkBoard`,
  dossier reviews, operational exports, restore verification and packaging use it.

Context edits serialize within the company and lock the job's task/measurement
sources during validation. PostgreSQL still uses the existing independent
authority boundary; a frozen/staged/retired environment cannot mutate these
tables, including through direct database writes. The migration is additive;
ordinary forward upgrades do not infer locations or parties from old free text.
Downgrade requires a separately verified pre-upgrade recovery procedure, not
dropping these tables from an active ledger.

## Remaining Lifecycle Work

[Partial Work Deliveries](WORK_DELIVERIES.md), migration 078, now connects selected
production output/completed tasks, inspection links, reviewed customer responses
and invoice reconciliation while keeping those states separate. Full contractual
closure, inspection coverage, client self-service, profile-driven packages and
feasible cross-job resource planning remain. [Installed Asset History](INSTALLED_ASSET_HISTORY.md)
now retains source-linked events, replacement pairs and existing service-register
links across jobs, without certifying commissioning or warranty coverage. Task
completion and reading an instruction do not establish those outcomes. Neither
model activates a supplier, WhatsApp or an external commitment.

## Design Invariants

- Retain company-owned sites/buildings, their floors/spaces/zones and installed
  assets. Preserve identity across later maintenance and follow-up jobs.
- Connect selected physical locations to jobs without rewriting the legacy job
  address or silently changing a customer or published position's agreement.
- Record job-specific parties and roles: customer, owner, resident, payer,
  decision maker, site contact, designer and inspector. Keep ordinary login,
  membership, credentials, approval and messaging authority separate.
- Create versioned work packages with intended result, location, instructions,
  safe stopping/handover notes and links to existing tasks and measured quantities.
  Never duplicate the authoritative task or financial quantity records.
- Make office changes traceable, optimistic-concurrency checked and replay-safe.
  Archive instead of deleting retained context. Refuse cycles, wrong-job links,
  references to archived locations and ambiguous state transitions.
- Include only explicitly shareable operational details in assigned workers'
  work packs. Changed instructions require a fresh acknowledgment, but changes
  to private billing contacts must not leak into phone/offline data.
- Bind new work-board positions to selected work packages where appropriate;
  changed published work information requires review before new placement.
- Feed the same retained context into dossier review, export, migration and
  backup verification. New tables must retain migration 076's authority fences.

## Domain Checks

A resident may provide access without owning the property or paying. A property
manager may request work without authority to approve extra cost. One building
can have several independently authorized jobs. An installed asset is different
from a hired tool. A task can be completed while inspection, client acceptance
and payment are still outstanding. An older physical-location record or work
package remains traceable when a later revision changes the instructions.

## Verification Required

SQLite and PostgreSQL contracts; stale concurrent writes and exact replay;
cross-job/company and office/field/client boundaries; unchanged older records;
property hierarchy and linked-scope integrity; shared-location change impact;
worker work-pack revision invalidation; office/mobile browser interactions;
backup/import/restore/schema guards; and package/container inclusion.

The wider acceptance of all work profiles, resource-feasible planning, combined
interruptions and independently evidenced closure remains part of the full
[delivery scope](TOTAL_SOLUTION_DELIVERY.md), not replaced by this model.
