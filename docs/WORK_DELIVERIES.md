# Partial Work Deliveries

Migration `078_work_delivery_lifecycle` connects a specifically described part
of a work package to existing execution, inspection, customer-evidence and
invoice records. It does not close the whole job or activate any provider.

## For Operators

In a job dossier, open **Deelopleveringen** under Work, Quality or Finance.

1. Retain existing production output against its approved production baseline,
   or complete an existing task through the normal execution workflow.
2. Choose **Uitgevoerd deel vastleggen**, select the work package, describe the
   executed portion and remaining work, and select its existing output records.
   A measured entry is allocated whole. Record separately measured portions in
   production first; this register does not invent a second quantity ledger.
3. Link the relevant existing inspections and billing milestones. Linked checks
   that pass do not prove that every required inspection was included. Missing,
   unapproved or failed checks remain separately visible.
4. Record a named customer's acceptance, acceptance with reservations, or
   dispute using **Klantreactie ter beoordeling**. Retain the actual response
   date, authority reference, explanation and a same-job evidence document.
   The document must contain a stored file or a traceable external reference;
   a title alone is insufficient. A role such as resident or payer is not proof
   that the person was authorized to accept the work.
   Acceptance cannot predate the latest known execution date of the selected
   output. A dispute can precede execution; a future response date is refused.
5. An owner/approver reviews that request in the existing approval queue. Office
   operators can prepare it but cannot resolve approvals. Source changes block
   an old approval. Reject/cancel the outdated request and prepare a new one.
6. Use **Correctie aanvragen** for a wrongly allocated delivery. Approval marks
   it corrected and frees its execution allocations for a new record. The old
   scope, decisions, measurements and audit trail are not deleted.

The four displayed states are independent:

| State | Meaning and boundary |
| --- | --- |
| Execution | Selected production measurements or completed-task reports are retained. They are not automatically an inspection or certification. Scope/source changes are flagged. |
| Inspection | Only the explicitly linked inspections are evaluated, including their approval and available checklist/QC integrity. No inferred inspection coverage or start permission. |
| Customer response | Reviewed evidence for the exact retained portion. Reservations and disputes remain distinct. A later evidence/source change preserves the earlier outcome in history and requests review. |
| Finance | The existing milestones' invoices and payment/credit reconciliation. Pending receipts do not count as received. Credit/write-off settlement is not labelled payment. No linked milestone means unknown, not free or paid. |

One invoice can relate to several portions. These are links to the same invoice,
not separate receivables to add together. The register does not allocate invoice
amounts between portions, certify contract completion or release retention.

Assigned workers see the operational description, measured output and linked
inspection state for visible work packages in their online and encrypted offline
work pack. They do not receive the customer name, authority reference, acceptance
evidence or financial reconciliation. Documents typed `acceptance_evidence` are
office-only immediately; documents used in a delivery-response request remain
office-only even if that request is rejected. Existing copies already downloaded
cannot be remotely erased. Prefer a separate private evidence document from the
outset; an execution drawing cannot be used as the acceptance evidence document.

The office export button exports the current view, including its private evidence
references. The owner operational export includes all retained delivery tables.
Neither export replaces a verified database-and-files backup.

## Developer Contract

- `GET /api/ledger/jobs/:jobId/work-deliveries` returns `records`, the available
  existing-source `options`, and an optimistic `sourceHash`.
- `POST` at the same path accepts `action`, `record`, `sourceHash`, `entryKey`.
  Owner/office writes; owner/office/approver reads. Field users cannot use it.
- `retain`: `packageId`, `title`, `scope`, `entryIds`, `taskIds`.
- `link`: delivery `id`, `inspectionIds`, `milestoneIds`.
- `request_response`: `id`, `outcome` (`accepted`,
  `accepted_with_reservations`, `disputed`), `respondent`, `respondedAt`
  (`YYYY-MM-DD`), `authorityReference`, `evidenceDocumentId`, `reason`.
- `request_void`: `id`, `reason`.
- Response/correction requests create `work_delivery_decision` approvals.
  The existing approval endpoint revalidates locked sources before resolution.
- An exact command retry returns the retained result. Reused keys with different
  content, stale sources, duplicate active allocation and conflicting pending
  decisions fail with `409`; no blind overwrite or duplicate quantity.
- The UI preserves an uncertain command while mounted for exact retry. It does
  not yet persist unsaved forms or pending commands across browser restart.
- A production entry/task may have only one active delivery allocation across
  the company database. Database unique indexes and native authority guards
  supplement the workflow checks, including on PostgreSQL.
- Dossier review includes deliveries in source fingerprints and flags changed
  delivery sources. It records an internal review, not an automatic external
  recovery action or a customer message.
- Backups verify tables, columns, unique indexes, snapshot checksums, retained
  allocations and approval chains. Hosted transfer preserves immutable delivery
  snapshots instead of rewriting their historical references. If storage or
  evidence metadata changes, an existing approval may require renewed review;
  an old customer response remains in history, not silently re-authorized.

The migration is additive. Do not drop its tables to downgrade an active
administration; use the previously verified recovery procedure and preserve the
post-upgrade records. Company-authority disaster recovery remains a separate,
unfinished delivery boundary.

## Still Required by the Total Solution

Client-portal publication and direct partial-acceptance replies, profile-driven
inspection obligations, measured remaining scope across revised work profiles,
money allocation/retention and final contractual closure, and cross-project
recovery planning remain in
[the delivery register](TOTAL_SOLUTION_DELIVERY.md). The new register does not
claim those features or live provider/hosting acceptance.

[Installed Asset History](INSTALLED_ASSET_HISTORY.md), migration 079, now connects
retained deliveries to installed-unit service reports and existing service
registers. This does not establish commissioning or safe-use release.

[Inspection Coverage](INSPECTION_COVERAGE.md), migration 080, now connects a
reviewed explicit control plan to evidence for each check on a retained portion.
Both the delivery overview and worker pack carry the same coverage state. This
is not independent proof that the operator identified every required inspection.
