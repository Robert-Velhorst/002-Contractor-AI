# Self-Service Work Board Implementation Plan

**Goal:** Connect new-worker registration, owner admission, published positions,
self-enrollment and assigned work packs without exposing the office ledger.

**Architecture:** A focused work-board module owns accounts, immutable published
positions and enrollment. It reuses ledger workers, qualification assessments,
availability/conflict checks and planned assignments. A separate mobile React
route uses its own authentication, not the local implicit owner identity.

**Spec:** Robert requested intake breakdown into selectable positions showing
place, time and duration, including self-registration by new workers. Admission
is manual once; placement is automatic only against owner-published terms.

**Constraints:** No external sends, purchases, commits, deployment or bypass of
qualification/start gates. Public cards use an owner-reviewed public title and
city, not customer names/address. Full work packs require a current assignment.
Published terms are immutable; close a position and create another to change it.
AI must not invent missing roles/dates/rates: derive suggestions from retained
tasks and mark required missing fields before publication.

**Verification interfaces:** WorkBoard public methods, HTTP authorization and
browser flow from registration through admission and enrollment. Include stale
terms, duplicate enrollment, full capacity, overlap, absent qualification,
pending/suspended accounts, and private-data isolation.

- [x] Registration: versioned tables, password hashing, scoped sessions and
  owner-reviewed admission with retained evidence references.
- [x] Positions: task-based draft suggestions; reviewed publication; atomic,
  replay-safe placement using existing qualification and conflict checks.
- [x] UI: mobile worker route and office control linked to the dashboard.
- [x] Verify: focused Node/API/browser tests, lint, build, bundle, docs.

Local-first preview does not mean publicly reachable onboarding. Production
still needs existing hosted auth, durability and HTTPS readiness. Email delivery,
identity-provider verification, automated replacement and password recovery are
not activated by this increment.

## Verification evidence

- Frontend: 32 tests across nine files pass, including whole-person capacity.
- Browser: eight selected Chromium workflows pass (worker registration and
  placement, owner publication/admission, existing dashboard and role-scoped
  access). Mobile worker and desktop owner screenshots were inspected.
- A targeted stopped-runtime restore test verifies that a real admitted worker
  account survives recovery with its status changed to suspended.
- Lint, production build, release contract, diff whitespace check and bundle
  budget pass. The separately loaded board increases total compressed assets
  from 497,252 to 504,076 bytes; the explicit total budget is now 510,000 bytes.
- Initial full backend run: 575 passed, one static-page request failed with 503,
  and 36 environment-dependent tests skipped. A browser build was rewriting the
  same output directory during that run. The full rerun without a concurrent
  build completed: 612 tests, 576 passed, zero failures, 36 environment-dependent
  skips. Retain the failed initial run as test-orchestration history, not as a
  claim that the production build was independently defective.
- Production PostgreSQL acceptance, public onboarding, container and packaged
  Windows acceptance were not run for this increment. The live preview has no
  synthetic applicant/job records. No provider actions, commits or pushes.
