# Security and Privacy

## Report a Vulnerability

Use GitHub's **Report a vulnerability** action on this repository's Security tab
to send a private vulnerability report. Do not open a public issue or pull
request for an unpatched security problem. If private reporting is unavailable,
contact the repository owner privately through a channel listed on the GitHub
profile; do not include credentials or personal/customer information in a public
message.

Include the affected revision or release, a concise impact statement, and a
minimal reproducible example using synthetic data. Avoid accessing, changing, or
exporting another person's data; do not test against live infrastructure or
third-party providers without explicit authorization. The maintainer will assess
reports and coordinate a fix and disclosure where appropriate. This project does
not currently promise a response-time SLA or a supported-version window.

The policy covers this repository's application code, deployment templates,
documentation, and GitHub automation. It does not establish authority to test
GitHub, Vercel, Meta/WhatsApp, Hetzner, or any other separately operated service.

## Repository safeguards

The public repository has GitHub CodeQL default setup, dependency graph and
automatic dependency submission, Dependabot alerts and security updates, weekly
dependency update proposals, secret scanning with push protection, and private
vulnerability reporting enabled. Its active `main` ruleset requires a pull
request, up-to-date `verify`, `windows-standalone`, and three CodeQL
language/action checks, and resolved review threads. It blocks branch deletion
and force pushes. It does not require an approving review; the repository has a
single maintainer, so automated checks are not a substitute for independent
review. Generic non-provider secret patterns are unavailable for this user-owned
repository under GitHub's current eligibility rules; GitHub documents that
feature for organization-owned repositories with GitHub Team and Secret
Protection. Provider validity checks remain disabled because they can send
detected credentials to issuers for validation. Do not infer either capability
from provider-pattern scanning or push protection.

GitHub security alerts remain review items until a finding is fixed and a new
scan confirms the result, or its applicability is documented with evidence.
Enabling a scanner does not mean that the alert queue is empty. Repository
security settings and hosted-service controls are separate; local CI does not
verify the production provider, organization access, or live deployment.

## Trust boundaries

Contractor.AI treats browser input, uploaded files, portal tokens, proxy headers,
provider receipts, and imported backups as untrusted. The Express layer authenticates
and validates requests; the ledger rechecks authorization-sensitive invariants in
the same transaction as the business change. PostgreSQL and private object storage
are the hosted durability boundary.

## Roles

| Role | Intended authority |
| --- | --- |
| `owner` / `approver` | Organization settings, approvals, recovery, diagnostics, audit, safety stop |
| `office_operator` | Commercial, planning, project-control, and governed office records |
| `field_worker` | Assigned field records and evidence only |
| client portal token | Narrow job/action scope, expiry, and approval-backed response only |

Production role keys must be independent non-template secrets of at least 32
characters. Browser login exchanges a key for a signed, revocable, HTTP-only,
Secure, SameSite=Strict cookie. Keys and cookies are not stored in local storage.
Rotate the role key to invalidate its sessions after suspected disclosure.

## Application controls

- Explicit CORS allowlist, trusted-origin checks for login/logout, JSON-only login,
  and same-origin checks for cookie-authenticated writes.
- Credential-free operation rejects non-loopback listeners and foreign request
  hosts. Client portal capabilities travel only in authorization headers; retired
  token-in-path routes cannot use the supplied capability.
- Strict hosted proxy allowlist; boolean, wildcard, universal CIDR, and numeric-hop
  trust settings fail startup.
- Persisted, bounded, HMAC-bucketed API and login rate limits that do not retain the
  source address.
- Helmet-equivalent explicit security headers and CSP compatible with the Vite
  production bundle; no inline event handlers or runtime HTML-string UI rendering.
- JSON and upload size limits; `MAX_UPLOAD_BYTES` is validated as a finite,
  bounded base-10 integer before the server listens. Extension, MIME, signature,
  path, checksum, ownership, and status checks apply to evidence.
- Stored evidence is read through authenticated ledger routes, never public static
  paths or object URLs.
- Request bodies cannot select an audit identity. The server binds every parsed
  object body to `local:owner`, the authenticated role principal, or the scoped
  `client_portal` identity and keeps that field out of retained business payloads.
  Mutation routes use that trusted request principal directly, including handlers
  that clone or reshape input; workflow-label fallbacks are not identities. Approval
  requester and resolver fields use the same principal before they enter retained
  decisions, downstream release records, chained audit history, or separation-of-duty
  checks. The release verifier rejects body-derived actors, legacy route fallbacks,
  and submitted-first approval principal expressions.
- SHA-256 chained audit events are committed with the underlying mutation.
- Exact idempotency and lease ownership prevent changed retries and stale workers.
- External commitments require a separate approval and an allowlisted verified
  provider receipt. Internal approval or package creation is not delivery.

## Local exposure and HAI

The Windows standalone launcher binds only to `127.0.0.1`, retains its random
owner key under the current user's `%LOCALAPPDATA%`, and does not place the key
in browser storage or a URL. The ngrok launcher fails before public exposure
unless both ngrok agent authentication and strong Contractor.AI owner
authentication are present. It trusts only the local proxy hop and configures
the exact returned HTTPS origin. Before success is announced, the launcher proves
local database/storage readiness, requires the public readiness endpoint to reject
anonymous access, and validates an owner-authenticated response through the public
edge. A verified timestamp is exposed without credentials in runtime diagnostics.
Startup failure and normal shutdown close public ingress before draining the app.

The HAI connector is read-only. Its owner endpoints and local exporter expose
bounded internal action summaries without evidence bodies, arbitrary ledger
payloads, credentials, or write-back authority. Each item explicitly declares
that it cannot execute and creates zero external commitments. Exported records
use HAI's maintained `accountfeed.GenericItem` input fields; the compatibility
verifier can execute HAI's parser from a temporary copy without modifying the
HAI checkout or granting either system command authority. Direct publication is
owner-only, requires an absolute configured path, atomically replaces the bounded
file, and validates its structure and checksum after writing. Other roles cannot
inspect the configured local path.

## Operational safety stop

The owner can suspend `autonomous_work` using an explicit confirmation phrase.
The state is persisted, revisioned, and audited. It blocks command-plan application,
scheduled cycle claims, and non-dry autonomous cycles with HTTP 423. It does not
block direct human-authored ledger work, backups, audit inspection, or a dry run.
It cannot call emergency services or stop physical machinery; site emergency and
Stop Work Authority procedures remain the responsibility of trained personnel.

## Support data boundary

`/api/operations/support-bundle` is owner-only. It includes application version,
release id, runtime/readiness status, migration names, aggregate table counts,
audit integrity, and automation state. It explicitly excludes customer and job
records, evidence content, logs, environment values, tokens, cookies, credentials,
connection strings, and storage keys. Operators should still review the JSON before
sharing it outside the organization.

## Hosted controls

Hosted startup fails unless all of the following are declared and testable:

- public HTTPS URL, exact CORS origin, and restricted ingress proxy trust;
- production authentication and bounded session/login/API policies;
- EU provider, region, `CONTRACTOR_AI_DATA_RESIDENCY=EU`, retained DPA reference,
  and retained retention-policy reference;
- certificate- and hostname-verifying PostgreSQL (`sslmode=verify-full`) with a
  managed snapshot/PITR recovery declaration;
- private HTTPS S3-compatible EU storage, scoped prefix, successful write/read/delete
  probe, versioning declaration, and retained backup-policy reference.

Declarations are not attestations. The operator must retain contracts, region
evidence, restore-test evidence, subprocessors, and incident contacts separately.

## Privacy impact summary

Likely personal data includes client contact details, worker assignment and
attendance, portal actions, evidence metadata, audit actor identifiers, and uploaded
site files. Collect only what a job requires. Field time records are not location
tracking; payment evidence is not bank initiation; worker records are not payroll.

Use organization policy and legal review to define purpose, lawful basis, access,
retention, data-subject handling, export, and erasure exceptions. Contractor.AI uses
non-destructive archive because invoices, contracts, safety, warranty, and audit
evidence can have conflicting statutory retention duties. It does not automatically
erase immutable evidence or claim AVG/GDPR compliance.

## Incident response

1. Activate the autonomous-work safety stop.
2. Restrict ingress and revoke/rotate role keys and provider credentials.
3. Preserve audit and provider evidence; do not rewrite the chain.
4. Run `npm run doctor` and verify `/api/operations/audit-integrity`.
5. Recover only from a checksum-verified backup or provider recovery point.
6. Reconcile external provider actions before retries.
7. Follow the organization's legal notification and data-breach process.

Do not commit `.env` files, data directories, downloaded backups, support bundles,
provider receipts, or uploaded evidence.
