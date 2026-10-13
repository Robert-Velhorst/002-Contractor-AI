# Identity Recovery and Key Rotation

This guide covers the optional account registry, not a company's job/evidence
backup. The commands are for a registry administrator with authorized OS/database
access and private encryption keys. A company owner key does not authorize global
person recovery. No public recovery-administration endpoint exists.

## What Recovery Means

A recovery backup preserves person IDs, contact details, company metadata,
memberships, invitation history and their audit chain. It does **not** contain
password hashes, recovery codes, assisted-recovery tokens, OIDC credentials or
browser sessions. These are deliberately not recoverable from an old snapshot.

Restoring it requires a new empty database, the exact original registry ID/issuer,
a fresh registry encryption key, and new client secrets for every company.
Restored people must complete reviewed account recovery. Restored company
memberships remain suspended (previously revoked ones stay revoked) until their
own company records a new admission decision. Person recovery cannot readmit them.
The original audit history remains and a new recovery event is appended.

This is a recovery snapshot, not a full physical database backup, PITR service or
an authority-transfer protocol. Do not restore physical registry backups directly
into service: they can contain old usable credentials. Do not run two writable
copies or change the issuer by editing this recovery file. One-authority handover
and a managed EU-provider recovery drill are still separate acceptance gates.

## Prepare Private Configuration

Use Node 22 and a protected directory. The examples use `data/identity-recovery`,
which is ignored by Git and Docker. On Windows, restrict the directory's NTFS
permissions; a POSIX `0600` file mode alone does not establish Windows ACL privacy.
For an extracted Windows package, use an absolute private data/configuration
directory outside `release/ContractorAI-windows-x64`. Its program directory is
generated output, not durable storage. Rebuilding refuses recognized operator
data or private configuration there instead of deleting it.

Provide `CONTRACTOR_IDENTITY_MODE`, the original `CONTRACTOR_IDENTITY_ISSUER`, and
`CONTRACTOR_IDENTITY_ENCRYPTION_KEY` through the private environment file described
in [Identity and Membership](IDENTITY_AND_MEMBERSHIP.md). Local mode requires a
persistent `CONTRACTOR_IDENTITY_DB_FILE` and rejects a PostgreSQL URL. Hosted mode
requires only `CONTRACTOR_IDENTITY_DATABASE_URL` with `sslmode=verify-full`, EU-region
confirmation and a DPA reference. Clear the SQLite path in hosted configuration.

Set a separate random 32-byte base64 `CONTRACTOR_IDENTITY_BACKUP_KEY`. Do not reuse
the registry key. Keep recovery keys in an access-controlled key store separate
from backup files and do not commit, paste into tickets or print them in logs.
The maintenance commands read keys from the environment, never command arguments.
References below are review records, not passwords, diagnoses or document contents.

## Create and Verify a Backup

```powershell
node --env-file=.env.identity scripts/identity-maintenance.js backup --output data/identity-recovery/checkpoint.json --actor registry-operator --reference RECOVERY-DRILL-001
node --env-file=.env.identity scripts/identity-maintenance.js verify --backup-file data/identity-recovery/checkpoint.json
```

The first command reads a consistent transaction, encrypts with AES-256-GCM, writes
the new file exclusively, flushes it and reads/decrypts it again. The receipt gives
the registry ID, issuer, snapshot ID, table counts and audit head. No credentials or
person records are printed. The file cannot overwrite an existing output. Keep
that receipt with the backup. The verification command never opens a database.

The current bounded format supports registry migration `002_registry_recovery`
and up to 64 MiB of plaintext. Larger or unsupported data fails rather than making
a partial backup. A readback on one disk does not prove off-site storage, provider
durability, access controls or retention; those require separate operator checks.

Inspect a configured registry before or after maintenance with
`node --env-file=.env.identity scripts/identity-maintenance.js status`. It reports
the registry ID, issuer, key generation, audit state and whether recovery is
complete, without listing people or exposing secrets. Opening an older registry
applies its normal supported schema migrations; this is not a raw database viewer.

## Restore Without Reviving Access

1. Stop the original registry and all replicas. Preserve its storage and keys for
   investigation; do not delete or overwrite them. Keep independent company-owner
   access available while SSO is unavailable.
2. Verify the encrypted backup and its expected registry ID. Prepare a separate
   private restore environment file with a **new empty** SQLite path or PostgreSQL
   database, the same issuer, the backup key and a **new independent** registry key.
   No company data or evidence belongs in this database.
3. Run the restore, substituting the actual registry ID from the verified receipt:

```powershell
node --env-file=.env.identity-restore scripts/identity-maintenance.js restore --backup-file data/identity-recovery/checkpoint.json --expected-registry-id registry_REPLACE_WITH_VERIFIED_ID --bindings-output data/identity-recovery/restored-companies.json --actor registry-operator --reference RECOVERY-DRILL-001 --confirm RESTORE_REGISTRY_WITHOUT_ACCESS
```

4. Retain the new private company-bindings file. Each company must receive its own
   new client secret through a separately approved secure channel. Do not distribute
   the full file or another company's credentials. Point the registry's private
   companies-file setting at it and configure company runtimes with their matching
   client secrets. The registry key remains in its separate private configuration.
5. Verify the receipt, row counts, audit chain and readiness before starting the
   restored service. Each person needs the reviewed recovery procedure below,
   followed by new company admission where appropriate. Old passwords, used or
   unused recovery codes, old invitations and sessions must remain ineffective.

Recovery inserts and verifies records in one transaction. An interrupted or failed
attempt never replaces an existing database. An initialized but incomplete target
has readiness disabled. Retain any output and failed target for diagnosis; do not
assume a failed process means PostgreSQL did not commit. Inspect current binding,
audit and receipt state before any retry, using a new empty target when necessary.

## Lost Password and All Recovery Codes

A registry administrator must first independently verify the exact person and a
private delivery channel. The software records the administrator and evidence
references; it does not certify that this human identity check happened correctly.
The person ID and login name must both match; email similarity is not sufficient.
The authorized administrator can locate the ID by an exact known login name:

```powershell
node --env-file=.env.identity scripts/identity-maintenance.js find-person --login-name reviewed-person --actor registry-operator --reference VERIFIED-IDENTITY-RECORD
```

This lookup is audited and does not accept email similarity or a public search.

```powershell
node --env-file=.env.identity scripts/identity-maintenance.js recover-person --person-id REPLACE_WITH_PERSON_UUID --login-name reviewed-person --output data/identity-recovery/person-recovery.json --actor registry-operator --reference VERIFIED-IDENTITY-RECORD --delivery-reference VERIFIED-CHANNEL-RECORD --confirm AUTHORIZE_PERSON_RECOVERY
```

The new private output contains a single-use `CIR.` code valid for thirty minutes.
The terminal receipt contains its request ID, not the code. A new issuance revokes
previous outstanding assisted codes for the person. Issuance does not lock the
account, change its password or alter membership. No message is sent automatically.

Give only that person's code through the independently verified private channel.
They enter their login name, the code and a new password under **Herstellen** in
the account portal. On successful use all personal/OIDC sessions are revoked,
the old recovery-code set is replaced, and eight fresh codes are shown once.
The person signs in normally afterward; company memberships are not changed.

To cancel an issued code before use:

```powershell
node --env-file=.env.identity scripts/identity-maintenance.js revoke-recovery --person-id REPLACE_WITH_PERSON_UUID --request-id REPLACE_WITH_REQUEST_UUID --actor registry-operator --reference CANCELLED-RECOVERY-RECORD --confirm REVOKE_PERSON_RECOVERY
```

Expired, used, cancelled, superseded, foreign-person and credential-version-stale
codes cannot reset a password. Rate limits and the normal password policy apply.
Keep notifications and personal-data retention under the operator's approved
procedure; this implementation does not provide automatic verified email delivery.

## Rotate Registry Keys

Rotation is a maintenance operation: stop all replicas and pause account changes.
Create and verify a current backup, then set a new independent
`CONTRACTOR_IDENTITY_NEW_ENCRYPTION_KEY` in private configuration. The command
rechecks registry ID, key generation, audit head and retained data against the
backup inside the write transaction. A stale checkpoint is refused.

```powershell
node --env-file=.env.identity scripts/identity-maintenance.js rotate-keys --backup-file data/identity-recovery/checkpoint.json --expected-registry-id registry_REPLACE_WITH_VERIFIED_ID --bindings-output data/identity-recovery/rotated-companies.json --actor registry-operator --reference KEY-ROTATION-RECORD --confirm ROTATE_REGISTRY_KEYS_AND_SESSIONS
```

The transaction replaces company client secrets and the registry encryption
binding, removes old OIDC signing/session state, revokes open invitations and
assisted-recovery requests, and appends an audit event. Personal passwords,
personal recovery codes and company memberships remain. A running old replica
fails readiness and refuses new writes instead of issuing grants with stale keys.

Retain outputs even on an uncertain result. After confirming the new binding and
receipt, set the registry's main encryption-key setting to the new key, use the
replacement companies file, and securely update each company client secret.
Restart and verify discovery, signing keys, fresh login and revocation. Do not
reactivate an old physical database/key pair as a rollback. Use the controlled
no-access recovery procedure if recovery is needed.

## Verification Scope

`tests/identity-recovery.test.js`, `tests/identity-postgres.test.js`, component tests
and the real browser identity workflow cover these paths. Their latest actual
results are in the [delivery register](TOTAL_SOLUTION_DELIVERY.md). Local protocol,
database and packaging proof does not establish managed EU recovery acceptance,
off-site backup policy, a completed human identity check or external delivery.

Design references: [OWASP password recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
and the [Node 22 authenticated-encryption API](https://nodejs.org/docs/latest-v22.x/api/crypto.html).
