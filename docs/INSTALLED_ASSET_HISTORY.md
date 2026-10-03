# Installed Asset History

Migration `079_installed_asset_history` connects installed components to the
shared work places, delivered work and existing warranty, aftercare and recurring
service registers. Portable equipment remains in its existing equipment register.

## Operator Workflow

1. In the work dossier, retain an **asset** work place underneath its actual
   site/building/space. Link that asset to subsequent jobs instead of recreating it.
2. Open **Installatiehistorie** and select the asset. Retain manufacturer, model
   and serial number, with a source/correction reason. An asset with retained work
   history keeps an already recorded serial number. A replacement is another asset,
   not an edit that gives the old unit a new serial number.
3. Use **Werk vastleggen** for installation, service, repair, inspection work or
   removal. Select a current partial work delivery covering the asset or an
   ancestor place, an execution date and an explicit description. The date cannot
   precede the latest known date in its execution source or be in the future.
4. For a record predating the contractor's own work, select **Historisch bronstuk**.
   It requires an existing same-job document containing a file or traceable external
   reference. A title alone is insufficient. This retains what the source reports;
   it is not newly verified execution or a warranty entitlement.
5. **Vervanging vastleggen** retains a removal event for the old asset and an
   installation event for the new asset in one transaction. Both share the same
   execution source and remain separate physical identities. A correction of this
   replacement corrects both sides, retaining their original snapshots.
6. Link existing warranty, aftercare or recurring records using **Vervolgacties
   koppelen**. Their existing status, due date and approval workflow remain
   authoritative. Removing a link does not cancel a claim, plan or follow-up.
7. **Onderhoudsdossier voorbereiden** prepares an internal draft from the linked
   active recurring plan, or reopens its existing unfinished preparation. The
   connected assets receive open, unassigned preparation tasks and work packages.
   No crew, visit, quotation, purchase or customer message is confirmed. The
   existing recurring preparation path also inherits its linked assets.
   A changed asset set blocks reuse of the previous preparation until its scope
   is reviewed; it does not silently omit newly linked units.

The same asset's earlier reports and register links are visible to authorized
office users from later linked jobs. Corrections and sharing changes are made
from the originating job. **Bronopdracht openen** provides that route. Selecting
an unrelated building does not automatically disclose every asset in that building;
link the actual installed component to the job/package explicitly.

## Field Privacy

A worker receives identity information only for assets directly attached to a
visible assigned work package. Earlier events are excluded until an office user
explicitly shares a separate operational summary. Private report text, customer
information, source documents, warranty discussion, prices and plan notes are not
part of that projection. Selecting a building-level package is not blanket access
to all installed assets or other jobs there.

The operator can withdraw a shared summary, including from an archived source job
without reopening operational writes. Subsequent online packs exclude it;
already downloaded encrypted offline copies cannot be erased remotely. Existing
offline expiry and identity/company binding still apply. A shared corrected or
source-changed report remains visibly flagged, not silently re-certified.

Documents typed `asset_history_evidence` are office-only from creation. Any
document selected as historical asset evidence remains office-only after use,
including after correction. Use a separate private document, never an execution
drawing. These restrictions apply to the job projection and document-content API.

## Developer Contract

- `GET /api/ledger/jobs/:jobId/asset-history` returns records, current source
  options and an optimistic `sourceHash`. Owner, office and approver may read it.
- `POST` accepts `action`, `record`, `sourceHash` and `entryKey`. Owner/office may
  write; actors come from the authenticated request, not submitted JSON.
- Actions: `profile`, `record`, `replace`, `void`, `share`, `link`,
  `prepare_recurring`. Every record contains `assetId`.
- `profile`: optional `manufacturer`, `model`, `serialNumber`; required `reason`.
- `record`: `kind`, `performedAt` (`YYYY-MM-DD`), `summary`, and `deliveryId`, or
  `documentId` for `prior_record`. Kinds are `installed`, `serviced`, `repaired`,
  `inspected`, `removed`, `prior_record`.
- `replace`: `replacementAssetId`, `performedAt`, `summary`, `deliveryId`.
- `void`: event `id`, `reason`. No source snapshot is overwritten or deleted.
- `share`: event `id`, explicit boolean `enabled`, and `fieldSummary` when true.
- `link`: `kind` (`warranty`, `aftercare`, `recurring`) and `recordIds`. This
  replaces only this job/asset/kind's active links, preserving inactive rows.
- `prepare_recurring`: `planId`; returns `preparedJobId` and `reusedOpenDraft`.
- Exact retries return retained receipts. Changed payloads with a reused key,
  stale sources and duplicate active event/source allocations fail with `409`.
  Concurrent work uses the existing company work-context lock and source-row locks.
- Native SQLite/PostgreSQL guards preserve frozen/staged/retired company authority.
  Backup verification checks tables, indexes, snapshots, source/job bindings and
  complete replacement pairs. Hosted import retains immutable event snapshots.
- Source changes enter the existing durable dossier-review process as
  `asset_history_source_changed`; that process does not contact anyone or clear
  the discrepancy automatically.
- Operational export includes all four new tables. UI export contains the full
  current office view, including private references. Neither replaces a verified
  database-and-files backup.
- Forms and uncertain write receipts are retained while the panel is mounted,
  not across browser shutdown. Source/storage metadata changes after a transfer
  may require review; old evidence is not silently rewritten into a new approval.

This is an additive migration. Downgrading by dropping these tables would discard
history; preserve post-upgrade evidence and use a reviewed recovery procedure.
Authority-aware disaster recovery remains a separate unfinished delivery gate.

## Boundaries

This history reports work, not safe operational status. Inspection work is not a
passed inspection, and a passed linked check is not proof of complete inspection
coverage. Manufacturer warranties, contractual guarantees and legal obligations
are not inferred from dates, model names or a service entry. No service intervals
or legal retention periods are invented. Current commercial registers still own
claims, resolution approvals and recurring dates.

Client-facing asset publication/acknowledgment, externally verified manufacturer
data and warranty terms, full required-inspection coverage, asset commissioning
and safe-use release, resource-feasible maintenance planning, and provider/hosted
acceptance remain in [the total-solution register](TOTAL_SOLUTION_DELIVERY.md).
