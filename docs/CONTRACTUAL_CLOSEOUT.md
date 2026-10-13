# Contractual Closeout Overview

## Purpose

The office-only `GET /api/ledger/jobs/:id/closeout-assessment` endpoint and
closeout workspace present a current, read-only overview of the recorded state
across operational completion, handover, client response, commercial changes,
receivables/payables, warranty and aftercare. It composes existing ledger
records; the assessment is not a stored approval or a replacement for those
source registers.

The response includes a source hash for the assessed record set, a refreshable
assessment time, domain-specific status and linked record identifiers. Finance
balances are reconciled from the invoice and payment ledgers and totals are
kept separate by currency. Customer and supplier balances are shown separately.
Active work packages additionally show the approved work-balance quantities,
task status, and each linked partial delivery's independent physical,
inspection-coverage, customer-response and finance states. Invoice IDs remain
references to their source billing milestones. A milestone can be linked to
only one active delivery; its recorded total and the invoice's reconciled
received/outstanding amounts are shown on that delivery. A pre-existing
duplicate link is surfaced as an allocation conflict and its invoice balances
are suppressed until an operator corrects the links. These delivery-level
figures are not added to the job-wide receivables totals a second time. Missing
work-balance data stays explicitly unconfigured or unknown.

## Interpretation

The work-package aggregate status uses this precedence: no active packages is
`not_configured`; any changed source or quantity/task mismatch is
`reconciliation_required`; otherwise a pending allocation review is
`review_pending`; otherwise an unallocated package is `allocation_required`;
only a fully current set of package balances is `reported`. Per-package states
remain visible so one blocked package does not erase the state of another.

Operational blockers, handover requirements, stale or unreviewed client
responses, unresolved variations/selections, invoice balances, and open
warranty/aftercare records remain separate. A customer response with listed
items is never treated as resolved simply because the office recorded a
disposition. A disposition that requires follow-up remains an open attention
state. A stale customer response remains stale until a current dossier response
is recorded.

An open invoice or aftercare item does not make the construction work itself
operationally incomplete. The assessment therefore reports domain states and
an overall follow-up status rather than collapsing everything into one
ambiguous “complete” flag. No response, open balance, or office note is
automatically converted to a legal/contractual conclusion.

The response always sets `determinations.legalAcceptance`,
`determinations.contractualClosure`, and `determinations.paymentRelease` to
`not_determined`. The endpoint does not write ledger state, approve variations,
release retention, close a job, send a message, issue an invoice, or authorize
payment. Authorized office roles can inspect it; field-scoped accounts cannot
fetch this office/financial overview.

## Verification Boundary

SQLite local behavior is covered by API tests for operational readiness,
client selections, outstanding receivables, response-review state, stale
source detection, role boundaries and unchanged determination fields. The
package projection is verified with a measured remaining-work fixture, an
accepted delivery and source-linked invoice while retaining the read-only
contract. Frontend
tests cover the separate domain summary, manual refresh, approver visibility
and field-scope isolation. Hosted PostgreSQL behavior and legal interpretation
remain unverified and deployment must retain the same explicit boundaries.
