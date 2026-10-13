# Domain Documentation

## Layout

Use one repository-wide context: `CONTEXT.md` and `docs/adr/` when they exist.
There is no need to introduce a monorepo context map for this setup.

Read relevant existing documentation before exploring a product area:

- `README.md` for the product and operational entry points.
- `docs/CONTRACTOR_OPERATING_MODEL.md` for the contractor workflow.
- `docs/THREE_PRODUCT_EXPERIENCES.md` for contractor, worker and client surfaces.
- `docs/FIELD_WORK_PACK.md` and `docs/CONNECTED_EXPERIENCES.md` for field and chat.
- `docs/superpowers/plans/` for existing scoped implementation plans.

Paths above are relative to the repository root. Verify documentation claims
against the current code and tests before describing a capability as functional.

## Consumer rules

Read `CONTEXT.md` and relevant ADRs if present. Their absence is not a blocker;
create them only when a domain-modeling workflow actually resolves terminology
or a decision. Do not fabricate a glossary or decisions during installation.

Use glossary terms consistently when available. Surface conflicts with an ADR
instead of silently replacing it. Do not duplicate existing authoritative docs.
For new-worker registration and positions, read `docs/WORK_BOARD.md`. Distinguish
the implemented local workflow from its remaining public-launch requirements.
