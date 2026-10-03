# Company Handover

## What This Does

Move one company's authoritative administration from a stopped local SQLite
installation to a verified, initially blocked PostgreSQL installation. A copied
backup is not permission to run both. The source first stops accepting changes;
the target cannot accept changes until the source records its retirement and
signs the release for that exact verified transfer.

This is a privileged operator procedure, not a dashboard button or an automatic
deployment. It does not establish provider/DPA compliance, deliver messages,
approve work, activate payments or change identity-registry memberships. Ordinary
local installations do not need authority keys until entering this procedure.
Use migration `076_company_authority_handover` on both sides. Follow the current
[EU hosting requirements](EU_HOSTING.md) as well as this guide.

## Before Starting

1. Rehearse on isolated copies. Keep a current encrypted recovery set, readable
   export and separate backup-signing key. Check database and evidence integrity.
2. Upgrade and verify the local installation before configuring its authority
   key. A key configured against an unenrolled database deliberately fails startup.
3. Record the exact company ID and ledger ID. Stop every source API, scheduler,
   tunnel and other writer. Keep every target application process stopped too.
4. Arrange new empty PostgreSQL storage with verified TLS and a separate, private
   company-scoped evidence prefix. Check EU residency, DPA, backups/PITR,
   encryption, versioning, quota, retention policy, HTTPS ingress and access rules.
   Restore rehearsal and provider acceptance remain required before production.
5. Preserve pending offline work. Finish synchronization before freezing where
   possible. Do not clear browser storage, replace cache identities or blindly
   replay old requests against a new origin. Guided offline reassociation remains
   unimplemented; unresolved field changes need a reviewed reconciliation.
6. Keep independent source and target Ed25519 keys in restricted private files
   outside source code and generated packages. A source key never goes to the
   target. Windows file modes do not substitute for verified NTFS permissions.

Commands below use Node 22. Windows packages can use `runtime/node.exe` instead
of `node`. Replace bracketed values with reviewed values. Environment files are
private and are not loaded automatically by npm scripts. The examples use
`node --env-file=...` explicitly; the files themselves must not be committed.

## Prepare the Two Environments

On each environment, generate its own private key using a new output filename:

```text
node scripts/company-handover.js keygen --output <private-path/source.authority-key.json> --confirm CREATE_ENVIRONMENT_KEY
node scripts/company-handover.js keygen --output <private-path/target.authority-key.json> --confirm CREATE_ENVIRONMENT_KEY
```

The first command belongs on the source; the second belongs on the target. Retain
encrypted, access-controlled recovery copies separately. No private key is stored
in the company ledger or included in its handover package.

The source private environment file sets `CONTRACTOR_AI_RUNTIME_MODE=local`,
`CONTRACTOR_AI_DATA_DIR`, `LEDGER_DB_FILE`, `UPLOAD_DIR`, the existing
`CONTRACTOR_AI_BACKUP_SIGNING_KEY` and `CONTRACTOR_AI_AUTHORITY_KEY_FILE` pointing
to the source key. Do not set a PostgreSQL URL there. Use absolute paths.

The target private environment file sets hosted mode, the retained
`CONTRACTOR_AI_COMPANY_ID`, new PostgreSQL URL with `sslmode=verify-full`, private
S3 settings, backup-signing key for verification and its own authority key path.
Set its data directory to the protected parent containing `backups/<backup-id>`
when importing. Configure all other hosted settings before application startup.

Create the signed target description and securely transfer it to the source:

```text
node --env-file=.env.handover-target scripts/company-handover.js describe-target --origin https://<exact-company-host> --output <private-path/target.json>
node --env-file=.env.handover-source scripts/company-handover.js status
```

The HTTPS origin must have no path, credentials, query or fragment. Confirm its
host and environment ID independently; a signature proves key control, not the
operator's right to use a domain. Source `status` reports the retained company,
authority, authority-history verification and source marker. It takes exclusive
local process locks, so stop the source application first.

## Freeze, Package, Verify, Release

All state-changing maintenance commands require the exact company/ledger IDs, a
named operator and a retained review reference. These values are audit records,
not substitutes for operating-system authorization.

```text
node --env-file=.env.handover-source scripts/company-handover.js freeze --company-id <company-id> --ledger-id <ledger-id> --actor <operator> --reference <review-reference> --target-file <private-path/target.json> --confirm FREEZE_LOCAL_SOURCE
node --env-file=.env.handover-source scripts/company-handover.js package --company-id <company-id> --ledger-id <ledger-id> --actor <operator> --reference <review-reference> --output <private-path/permit.json> --confirm PACKAGE_FROZEN_SOURCE
```

`freeze` records the target and prevents ledger writes, including writes through
already-open SQLite connections. It also advances a private source-side marker,
`<ledger-file>.authority.json`, outside ordinary database backups. Keep that file
with the source installation permanently. Never delete or lower it to enable a
restore. An older database, including one without authority records, cannot start
normally while that retained marker identifies a newer authority generation.

`package` uses a consistent SQLite snapshot, copies local evidence, signs manifest
v3, verifies file hashes and seals one permit to that exact manifest. The output
reports the backup ID and directory. **The package is signed, not encrypted.**
Use encrypted transport and encrypted, restricted storage before moving it. Keep
the manifest bytes unchanged. Do not publish documents or source/operator data.
Failed attempts remain available for investigation; they are not auto-deleted.

On the target, import the package and its permit into the empty database:

```text
node --env-file=.env.handover-target scripts/migrate-local-backup-to-hosted.js --backup-id <backup-id> --permit-file <private-path/permit.json> --receipt-output <private-path/verified.json> --confirm MIGRATE_<backup-id>
```

The import locks the target tables, checks row counts/hashes, rewrites evidence
references, reads back evidence, verifies the source audit chain, rebuilds the
destination chain and retains a migration receipt. Old browser/OIDC sessions and
rate-limit windows are cleared; managed operators and legacy worker accounts are
deactivated/suspended. These access states require explicit review afterward.

The new target remains `staged`, with database writes and application startup
blocked. A signed verification receipt is retained only after diagnostics and
audit verification pass. Transfer that receipt back to the stopped source, then:

```text
node --env-file=.env.handover-source scripts/company-handover.js retire --company-id <company-id> --ledger-id <ledger-id> --actor <operator> --reference <review-reference> --receipt-file <private-path/verified.json> --output <private-path/released.json> --confirm RETIRE_LOCAL_SOURCE
node --env-file=.env.handover-target scripts/company-handover.js activate --company-id <company-id> --ledger-id <ledger-id> --actor <operator> --reference <review-reference> --release-file <private-path/released.json> --confirm ACTIVATE_VERIFIED_TARGET
```

Transfer `released.json` securely between these commands. The release identifies
the exact verified receipt, company, target, transfer and generation. Retirement
is not reversible through `abort`. Activation and repeating the same retirement
are idempotent. Check `status` on both sides before starting the hosted runtime.
The target runtime requires its own private key and exact configured public
origin. Verify authenticated readiness, evidence retrieval and reissued access.

For Compose, keep the key out of image layers and mount it read-only through the
optional `docker-compose.authority.yml`. Configure the host-side private file as
`CONTRACTOR_AI_AUTHORITY_KEY_HOST_FILE` in the private hosted configuration:

```text
docker compose --env-file .env.hosted -f docker-compose.hosted.yml -f docker-compose.authority.yml up --build -d
```

That starts real infrastructure and is a separate operator action, not part of
the repository's test suite. The mounted file must be readable by the non-root
container user and inaccessible to unrelated users. Compose secrets alone do
not establish encryption at rest or proper host permissions.

## Interrupted or Aborted Transfers

| Situation | Supported response |
| --- | --- |
| Missing package output file after sealing | Use `export-permit` with the common company/operator arguments and a new `--output` filename. Keep the retained package; do not create a second sealed package. |
| Missing verified receipt output | On the target use `export-receipt` with the same common arguments and a new `--output`. It requires the matching key and an already retained verified receipt. |
| Missing release output | Repeat `retire` with the exact same verified receipt and a new output filename. The retained release is returned without another transition. |
| Failure definitely before the import commit attempt | The importer rolls back data and attempts cleanup of only its newly uploaded objects. Inspect any reported cleanup failures before retrying. |
| `migration_commit_unknown` or any uncertain commit outcome | Keep the target database, all uploaded objects and source frozen. Do not blindly retry, erase the target or remove evidence. Inspect retained authority/history and the migration receipt. A committed but not verified target stays blocked; there is no automatic resume-verification command yet. |
| Source remains frozen and no release has been issued | Use `abort` with the common arguments and `--confirm ABORT_UNRELEASED_HANDOVER`. The source advances generation and becomes active again with its source key. Quarantine the old target; a later attempt requires a fresh transfer and empty target. |
| Marker advanced but the source DB transaction did not complete | Startup and further maintenance transitions fail closed. Preserve the DB, marker, pending files, keys and receipts for reviewed repair; there is no automatic marker rollback or repair command. |
| Target fails after source retirement | Recover the target under its existing authority with a reviewed provider procedure. Never reopen an old source copy. Authority-aware disaster restoration still needs implementation and provider rehearsal. |

`restore:local` deliberately refuses authority-bound backups or targets and any
target retaining an authority marker, even if its current database is corrupt.
It is still available for ordinary unbound local installations. Do not treat
that refusal as a reason to remove the key configuration or marker.
After an abort the local source still requires its authority key for every later
startup. Keep that configuration in the protected service/launcher environment;
the default Windows launcher does not import `.env.handover-source` automatically.

## Boundaries and Remaining Work

This protocol fences supported runtime/maintenance paths. A malicious or mistaken
administrator with physical copies of all private keys, database files and old
markers can bypass an offline installation's controls. It is not a distributed
consensus or global anti-cloning system. Restrict OS/database administration and
retain source retirement evidence independently. Hash-chained history detects
accidental changes, not a privileged attacker rewriting the entire chain.

The legacy unbound migration library remains for compatibility fixtures; the
canonical migration CLI now requires a targeted permit. Calling the library
without authority is not a supported company relocation procedure.

Still required: authority-aware local/provider disaster recovery, controlled key
rotation/replacement for company authority, guided field/offline reconciliation,
and reviewed identity-registry company-origin rebinding. Current immutable
registry company bindings do not automatically move with this ledger. Do not
promise working SSO at a new origin until that procedure is implemented and
tested. Managed EU storage/PITR, access policies, real devices and production
cutover need separate acceptance. This increment does not finish phase 2 or the
full [total-solution scope](TOTAL_SOLUTION_DELIVERY.md).
