# Client Completion Reviews

## Purpose

The client portal can record a response to the exact current handover issue package after that package is ready and its linked communication has a verified `sent` receipt. The package remains downloadable through the scoped portal token while that source is current.

The client chooses one response:

- `accepted`
- `accepted_with_items`
- `not_accepted`

The portal retains the respondent name, whether authority to respond was affirmed, optional or required notes, package identity and hash, source hash, submission time, and a replay-safe request key. An `accepted` statement may have an empty note; the other outcomes require a meaningful note. The portal permits one response per portal access and package version.

## Review and authority boundary

Every response begins as `received_unreviewed`. It is shown to office roles in the job closeout workspace with the dossier reference and source-current state. Authorized office roles can append review actions: follow-up required, recorded without further action, or escalation of an explicit client non-acceptance. Each action has a required rationale, actor, time, source-current snapshot, audit event, and idempotency key. Actions never overwrite the customer's original response; retries with the same key are safe, while conflicting reuse is rejected. A stale response can be reviewed only after an explicit confirmation and remains marked stale.

The office disposition is an operational triage record, not an electronic signature, legal determination, or automatic client acceptance. It does not change job lifecycle, contract value, payment, invoice state, or authorize work. No customer or external message is sent by recording a response or office review.

When underlying handover evidence changes, the old response remains visible but is flagged as no longer current; a new response requires a newly prepared and delivered package. Revoked or expired portal access also prevents further submission and makes a prior response non-current for live review.

## Data and deployment

The ledger retains the response in `client_completion_reviews` (migration `092_client_completion_review`) and append-only office dispositions in `client_completion_review_actions` (migration `093_client_completion_office_review`). SQLite backup/restore and the owner-only operational reconciliation export preserve both. The operational export is not a restorable backup. Data-subject inventory includes these records; approved client pseudonymization redacts respondent name and both client/office notes while retaining minimal operational evidence.

This capability is online-only. Cached portal snapshots never enable a completion response. Production still requires the platform's normal authenticated HTTPS deployment, scoped portal access, and backup controls. No jurisdiction-specific legal effect is asserted; contractual acceptance/signature requirements must be established separately for each deployment and customer contract.
