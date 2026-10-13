# ADR 0003: Company Authority Must Be Handed Over, Not Copied

Status: implemented protocol; production recovery/acceptance still required.
Date: 2026-09-12.

## Context

A company retains its identity and job dossiers when moving from SQLite to
PostgreSQL. Copying that database while both installations can operate would
create conflicting assignments, approvals and financial records. Offline field
copies are not independent company authorities. Local-first operation must not
depend on an always-available central licensing or consensus service.

## Decision

Use separate Ed25519 environment keys outside the database. A stopped source
freezes, seals one signed backup permit to an exact hosted target, verifies the
target's signed import receipt, then retires and issues a matching release.
Only that release activates the staged target. Store transitions in a separate
hash-chained authority history, leaving business-audit chronology intact except
for the existing evidence-reference migration/rechaining procedure.

Migration 076 installs database-native write guards for every current ledger
table except schema-migration and authority-control tables. Future migrations
adding business tables must install equivalent guards. This is a forward-only
migration: recovery does not remove the guards or revive a retired source.
Schema installation requires the normal maintenance/startup window and takes
table locks; it is not a zero-downtime promise.

A source-side high-water marker outside ordinary database backups advances
before source authority commits. Stale or inconsistent state fails closed.
Local maintenance also shares a DB-path process lock with the API and restore
tool. A lost target commit acknowledgment retains database and uploaded evidence;
cleanup after a possible successful commit would destroy valid references.

## Consequences

The supported handover has an intentional unavailable interval between freezing
the source and activating the verified target. All consequential external
actions remain governed by the existing approval/provider contracts. The
handover is an operator CLI workflow, not automatic deployment or a legal proof.

This does not prevent a privileged administrator from cloning all files and
keys or rewriting control tables. Protect those privileges and retain evidence
independently. Ordinary authority-bound restore is refused until a reviewed,
rollback-safe recovery workflow is implemented. Registry origin rebinding,
offline reconciliation and managed-provider rehearsals are separate work.

See [Company Handover](../COMPANY_HANDOVER.md) for the single operator procedure.
