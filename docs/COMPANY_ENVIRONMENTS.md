# Company Environment Boundaries

## Implemented Boundary

Every running server owns one company environment. Migration
`074_company_runtime_boundary` adds a singleton identity table. The first local
start binds the existing ledger to a generated company id and ledger id without
moving or relabelling its existing business rows. Later starts reuse those ids.
Setting `CONTRACTOR_AI_COMPANY_ID` to a different id refuses startup.

SQLite and PostgreSQL startup inspect retained ownership before initializing
tables, running migrations, binding a new identity or importing legacy state.
A mismatched directory identity, foreign configured company or invalid retained
identity is refused without changing retained schema or records. A directory
marker cannot adopt an unbound database: restore its original ledger instead.
This also applies in authority-maintenance mode. Opening a SQLite path may still
create an empty file or parent directory; this is not a filesystem rollback.
Unbound legacy ledgers without a directory expectation can still acquire their
first identity, while migration callers that omit company binding remain unbound.
PostgreSQL connections require `public` as the only application schema and pin
that search path before any runtime, maintenance or migration statements.
Additional visible application schemas or a different default creation schema
are rejected with `postgres_schema_unsupported`; they cannot hide a frozen
authority or shared identity registry from the public-schema checks. Configure
the database role or connection options explicitly for `public` when needed.
Ownership inspection also resolves the same `company_runtime` relation used by
table reads. Deployment in a custom application schema is not supported.

The data directory and local upload directory have private
`.contractor-company.json` binding markers. A marker mismatch prevents legacy
data import. Do not remove markers to reuse a directory for a different company.
Use a new data directory, database and uploads directory instead. These markers
are protection against configuration mistakes, not OS-level access controls.

Browser sessions have company-specific cookie names and signatures. Old cookies
require sign-in again. Shared raw bootstrap keys are not a company switcher:
configure independent keys per environment and do not distribute owner keys to
workers. Role and job restrictions remain enforced by the server.

The optional [identity service](IDENTITY_AND_MEMBERSHIP.md) provides the actual
personal-account/company switcher. Its separate registry stores people,
memberships and admission evidence, not project dossiers. Company sessions use
OIDC authorization code flow with PKCE and server-side encrypted tokens. Each
online request rechecks the active membership; registry failure does not grant
access. Local owner keys remain a separate operator access path.

`GET /api/session` exposes `company.id`, `company.ledgerId` and the operator's
matching `companyId`/`ledgerId`. The web application pins its first server
identity for the life of the page and sends `X-Contractor-Company` and
`X-Contractor-Ledger`. A mismatch returns `409 company_runtime_mismatch` without
running the requested workflow. These headers assert the intended destination;
they never grant access or select a database. Existing ledger API authorization
is still required.

Native document, report and backup links use the same identity assertions in
`__company` and `__ledger` query parameters. These are non-secret destination
checks, not authentication tokens; streaming and browser downloads still use the
operator's authenticated session. The server rejects conflicting or repeated
assertions before retrieving content.

## Offline Work

New encrypted work folders and field outbox entries include the company, ledger
and operator identity. Multiple work folders can coexist on one browser origin.
The offline screen selects, unlocks and deletes only the chosen folder; another
company's queued questions remain retained. Synchronization checks the signed-in
company and account before sending, including after a reused local port.

The older general field outbox is still ordinary browser storage, not the
passphrase-encrypted work-folder vault. Its entries are now scoped and quarantined
on a mismatch, but shared-device protection and guided recovery still need the
broader offline lifecycle work. Use separate browser/OS profiles on shared devices.

Legacy unscoped work folders are not deleted or silently assigned to the current
company. They remain readable within their previous access window, but their
queues cannot be sent automatically. Guided legacy-folder reassociation and
expired-folder recovery across the identity migration still need implementation.
Device-level encryption, passphrase protection and expiry remain important:
remote revocation cannot erase an already downloaded, offline copy.

## Backup And Migration

New operational exports and signed backup manifests retain company identity.
Restore checks the manifest against the SQLite identity and any target directory
or ledger identity before replacing files. A valid signature alone does not
authorize overwriting a different company. Unbound legacy backups can still be
recovered in an empty environment through the existing explicit legacy recovery
path; they cannot silently replace an already bound company.

The hosted migration retains the SQLite identity in PostgreSQL. The CLI requires
`CONTRACTOR_AI_COMPANY_ID` to match the source backup. Upgrade and verify an old
unbound source locally first. Runtime sessions are invalidated and migrated
managed/board accounts remain deactivated or suspended under the existing
recovery rules; this change does not introduce automatic account reactivation.
Migration 075 adds shared-identity session storage and explicit work-board
membership links. Both local restore and hosted migration clear pending OIDC
login flows and runtime sessions; a backup cannot revive those browser sessions.
The migration also refuses a different company's object prefix before opening
the destination database or uploading evidence.

The optional identity registry has its own [encrypted recovery procedure](IDENTITY_RECOVERY.md),
independent of company backups. Restoring it never restores passwords, browser
sessions or active memberships. Every company must review admission again;
recovering a person's login does not override that boundary. Registry key
rotation also replaces each company's private OIDC client secret.

## Hosted Contract

- One PostgreSQL database and runtime configuration per company.
- `CONTRACTOR_AI_COMPANY_ID` must be explicit and match the retained ledger.
- Object storage defaults to `companies/<company-id>/evidence`; a custom prefix
  must stay below `companies/<company-id>/`.
- Restrict the provider credentials to that company's private object scope.
  The application's key checks are not proof that the provider policy is correct.
- Existing EU residency, DPA, HTTPS, database TLS, durability, backup, retention,
  access-control and readiness requirements still apply.

No live hosted environment or provider policy is configured by these changes.

## Still Required

This is not a complete multi-company service. Shared registry, OIDC, invitations,
explicit legacy-worker linking, recovery codes and company switching are now
implemented and locally tested; deployment is optional and not yet activated.
Registry recovery, key rotation and assisted lost-code recovery now have tested
local commands. Managed EU-provider recovery drills, guided offline reassociation
and central cross-company availability reservations remain in the
[delivery register](TOTAL_SOLUTION_DELIVERY.md).
The [company handover protocol](COMPANY_HANDOVER.md) now provides source freeze,
signed target verification, source retirement and target activation. Database
guards and source high-water markers fence supported runtime/restore paths.
Authority-aware disaster recovery, authority-key rotation and reviewed registry
origin rebinding remain. A privileged administrator copying all old keys, markers
and databases is outside this offline protocol's anti-rollback boundary. Wider
AI, search, provider and lifecycle acceptance remains separate from these tests.
