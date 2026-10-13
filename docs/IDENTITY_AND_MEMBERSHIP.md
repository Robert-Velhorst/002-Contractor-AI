# Identity and Company Membership

This is an optional, separately configured access path. Existing company owner
keys remain available for recovery. Installing dependencies or building the UI
does not create an account service, grant anyone access or activate a provider.
The ledger and three product experiences remain the authoritative product.

## For People and Companies

- A personal account has a unique login name, a password of at least 16 characters
  and eight single-use recovery codes. Contact email is optional and unverified;
  it is not proof of identity and does not merge accounts.
- A company owner creates an invitation under **Beheer > Bedrijfstoegang**.
  The link is shown once, expires after seven days and is not emailed automatically.
- The person signs in and accepts. This creates a requested membership, not access.
- The owner separately verifies the person, role and, for field work, the existing
  worker profile. The decision retains a reference and version. Owner privileges
  need an explicit confirmation in the form.
- Each company has separate membership status and access rights. Suspending or
  revoking company A does not revoke company B or silently cancel assignments.
- A field admission links a reviewed worker record, not an inferred email match.
  Converting an existing work-board account requires its explicit selection and
  confirmation that its password login will be retired. Its ID and applications
  remain; prior password sessions stop working. Ambiguous links are refused.
- **Mijn account en bedrijven** lists only the signed-in person's companies.
  Entering a company uses that company's own runtime, never a merged dossier.
- Recovery replaces the password and revokes all account/OIDC sessions. It does
  not grant or alter company memberships. Loss of both password and recovery
  codes has no automatic bypass. A registry administrator can issue a single-use,
  thirty-minute recovery code only after independently verifying the person and
  private delivery channel. The code is retained in a private file, not sent
  automatically. See [Identity Recovery](IDENTITY_RECOVERY.md).

Client portal links remain their existing token-scoped access path. A client
does not gain office or worker access by registering a personal account.

## Local Configuration

Use Node 22. The registry must have its own origin and database, separate from
every company ledger. An existing ledger cannot open a registry DB, or vice versa.
Registry migrations run on startup; encrypted issuer binding is checked first.
Registry migration `002_registry_recovery` is separate from company migration 075.

1. Prepare a private `.env.identity` using `.env.identity.example`. Set the issuer
   to the exact origin, without a path, query or fragment. HTTP is accepted only
   on explicitly local loopback origins; local service binding is loopback-only.
2. Generate a registry encryption key and a different session encryption key for
   each company. Generate an independent confidential client secret per company.
   For a 32-byte base64 key: `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
3. Put exact company bindings in the private `identity-companies.json` array:

```json
[
  {
    "id": "your-existing-company-id",
    "ledgerId": "the-existing-ledger-uuid-from-api-session",
    "name": "Your company",
    "origin": "http://127.0.0.1:3000",
    "clientId": "your-company-client",
    "clientSecret": "replace-with-an-independent-random-secret"
  }
]
```

Obtain the existing `company.id` and `company.ledgerId` from that runtime's
`GET /api/session`. Do not invent or replace a ledger identity. Bindings are
immutable; changing issuer, origin, ledger or client secret requires a reviewed
migration, not a startup overwrite. The documented maintenance command rotates
client secrets together with registry keys. Restart after adding a binding.

4. Build with `npm run build`, then start the service with
   `node --env-file=.env.identity identity-server.js`. Open its `/identity.html`.
5. Add these five settings to each authenticated company runtime, then restart it:

```dotenv
CONTRACTOR_AI_REQUIRE_AUTH=true
CONTRACTOR_AI_IDENTITY_ISSUER=http://127.0.0.1:3010
CONTRACTOR_AI_IDENTITY_CLIENT_ID=your-company-client
CONTRACTOR_AI_IDENTITY_CLIENT_SECRET=the-matching-private-client-secret
CONTRACTOR_AI_IDENTITY_SESSION_KEY=the-independent-base64-session-key
CONTRACTOR_AI_IDENTITY_PUBLIC_ORIGIN=http://127.0.0.1:3000
```

Keep a strong owner bootstrap key configured. Partial identity configuration
fails startup. With all identity settings absent, existing local/key access
continues unchanged. Never expose a credential-free company runtime publicly.
The identity settings are intentionally not enabled in the checked-in defaults.

## Protocol and Isolation

The registry uses [oidc-provider](https://github.com/panva/node-oidc-provider);
company runtimes use [openid-client](https://github.com/panva/openid-client).
The authorization-code flow requires PKCE S256, state, nonce, exact registered
callback URLs and confidential client authentication. The application checks
company ID, ledger ID, membership, version and role before creating a session.
Signing keys and provider models persist encrypted in the separate registry;
company access tokens and login flows persist encrypted in the company ledger.
Raw session tokens and recovery codes are stored as hashes where lookup is needed.

Every identity-authenticated online API request checks the current provider
token and membership. Roles retained in the browser are never authoritative.
Loss of the registry prevents online SSO access; it does not grant offline access
or prevent an independently configured owner bootstrap key from working. This
requires capacity/availability planning before hosted deployment.

Company membership management is owner-only and server-to-server. Browser origins
cannot call the confidential service API. The registry UI uses exact-origin and
CSRF checks, HttpOnly cookies, request limits, private responses and CSP-safe React
rendering. Callback codes and state are excluded from company request logs.
The registry keeps a hash-chained audit without passwords, access tokens or codes.

Field activation spans two authorities: registry membership followed by a local
reviewed worker link. If that local step fails, field SSO remains blocked. Refresh
the membership and retry the reviewed decision; do not assume a timeout meant
that no decision was recorded. The UI never blindly retries a consequential POST.

## Hosting and Recovery Gates

The same Docker image includes `identity-server.js`; override its command for a
separate registry service. Do not run identity and a ledger on a shared origin or
database. Hosted startup requires a PostgreSQL URL with `sslmode=verify-full`, an
HTTPS issuer, EU-region confirmation and a DPA reference. Trust only the actual
reverse proxy address range, never arbitrary forwarded headers. The registry
readiness route is `/health/ready`, distinct from the company's `/api/health/ready`.
The packaged Docker healthcheck selects the service using
`CONTRACTOR_IDENTITY_MODE` and `CONTRACTOR_IDENTITY_PORT`. The minimal registry
health response supports internal loopback probes without public-origin/TLS
headers and verifies database migration availability, the current key generation
and completed recovery state. Account and OIDC routes
still require the configured origin and HTTPS in hosted mode. Local registry
mode binds to its own loopback interface; Docker port publication alone does
not make that local-only listener reachable from a host browser.

These configuration checks do not establish actual provider location, a signed
DPA, network isolation, capacity or disaster-recovery acceptance. Those are
operator/deployment verification gates. No real EU service is activated here.

Use the separate [registry recovery procedure](IDENTITY_RECOVERY.md). Its encrypted
snapshot preserves people, company metadata, memberships and audit history, but
excludes passwords, recovery codes, signing keys, client secrets and sessions.
Store the independent backup key separately from access-controlled backup files.
Company backup/export endpoints do not include the registry.
Restoring or migrating a company ledger clears all retained identity sessions and
pending OIDC login flows. Registry restore accepts only a new empty database with
the same verified registry/issuer and a fresh encryption key. It creates new
company client secrets and suspends memberships; previously revoked ones remain
revoked. Person recovery never substitutes for each company's new admission.
Key rotation invalidates old signing/session state and old running replicas.
An incomplete restore remains unready. Do not reactivate an old physical database
as a rollback, and do not activate hosted identity without a provider recovery
drill, verified access controls and a one-authority operating procedure.

## Verification and Limits

Node tests exercise the registry contract and real local OIDC exchange against two
company runtimes, plus explicit worker-account conversion. Browser coverage uses
real registration, invitation/admission controls, OIDC, mobile work-board access
and normal/assisted recovery, not mocked provider responses. Recovery tests also
exercise SQLite/PostgreSQL, stale replicas, private-file failures and the actual
Windows/container maintenance commands. See the dated delivery register for
the latest executed results; test presence alone is not a passing result.

This does not finish the total-solution scope. Registry recovery and key rotation
are locally implemented and tested; human identity verification, private key/file
access controls and managed EU-hosting acceptance remain operator gates. The
[company handover protocol](COMPANY_HANDOVER.md) now moves ledger authority, but
does not automatically rebind the registry's immutable company origin or recover
offline queues. Those reviewed procedures remain work. The expanded work model
and resource-feasible planning remain later implementation phases.
