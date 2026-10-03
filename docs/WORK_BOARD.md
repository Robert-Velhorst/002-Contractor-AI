# Self-Service Positions and Worker Registration

## Local workflow

Administrators can choose **Verder als beheerder** below either worker login or
registration form. This opens the existing dashboard; it does not create a worker
account or bypass configured operator authentication.

1. Open `/work-board.html` on the running application. A new worker registers
   name, contact details, one or more preferred work areas (or nationwide
   availability), declared trades and an optional company name. The worker can
   update this preference later from **Mijn werkgebied**. Existing profiles
   continue to use their saved region as a fallback.
2. The owner opens **Beheer > Toelating uitvoerenden**, checks the applicant and
   records a contact/admission evidence reference. Admission creates a ledger
   worker; a self-declared trade is not proof of a mandatory credential.
3. Open a project dossier, select **Werkzaamheden** or **Planning**, then
   **Open posities > Positie vrijgeven**. Existing tasks can prefill a suggestion.
   Save an incomplete position as an owner-only concept and resume it later.
   The owner can prepare a private draft for each open task not already linked to
   a current position; intake coordination checklist tasks are excluded. Drafts
   do not publish, reserve capacity or assign workers.
   When a work package contains multiple trades, select the position's role and
   then choose only the matching package tasks. Package tasks are not silently
   bundled into one role; a mixed-trade package requires separate positions.
   Rate and capacity are not guessed. Review the public title, city, role,
   start/end, hours, capacity, hourly rate, materials, tools and start conditions
   before explicitly publishing it to the worker board. Optionally require a
   human start release for the position; this requires at least one linked task
   and is included in the immutable published terms. Positions can also name up
   to 20 additional declared skills beyond the primary trade. Applicants see
   these before expressing interest; admitted applicants missing any required
   skill are blocked from placement until their profile is reviewed and updated.
   These are self-declared profile signals, not credential evidence; mandatory
   qualification checks remain separate and continue to block placement.
   An applicant can edit declared skills before admission. An admitted worker's
   edit is retained as a proposal and does not change the active worker profile
   until the owner records a review reference and approves it; rejected proposals
   leave the existing profile in force. Personal company-account profiles are
   managed by the contractor and cannot be changed through the legacy workboard.
   Previously published positions are checked against the current dossier before
   each worker-board response and again during enrollment, offer and placement
   checks. A legacy release that now matches known client identity, contact
   details or exact address is hidden from new workers and cannot be applied to
   or placed from. The office sees a privacy-review warning and must close the
   old enrollment and publish corrected terms. Existing assignments and their
   recorded terms are not silently changed. This prevents further exposure; it
   cannot recall information workers may already have seen or copied. Pending
   offer notifications for a flagged position are shown as a neutral review
   notice, and accepting that offer is blocked. When the office closes a
   position, its still-open offers are revoked in the same transaction and
   applicants return to their retained interest or waitlist status; assignments
   already made are unaffected.
   A published position is also removed from the worker board if its linked
   work-package or source-task schedule no longer matches the current project.
   Existing unplaced applicants receive a review notice instead of stale terms;
   the office retains the position and can close or republish it after review.
4. Applicants can record interest while awaiting admission. An admitted worker
   accepts the published terms and enrolls. If linked materials and task sources
   are current, the enrollment creates one internal planned assignment. If a
   linked requirement is still needed, partially received, or otherwise
   unverified, the application remains interest and does not reserve capacity
   or create an assignment.
   On the worker board, search and trade filters narrow currently open positions
   by their published title, city, role, description, materials, equipment,
   prerequisites and additional skills. Filtering is local to positions already
   returned by the server; it does not expand access or change admission,
   eligibility or placement checks.
5. For a position with the start-release policy, the assigned worker cannot
   report a linked task as in progress until an owner/approver has issued a
   current release and the worker has confirmed receipt in the work pack.
   Blocker reports remain available without a release.
6. Once full material quantities have been recorded with receipt evidence, the
   office can send a concrete, expiring offer against the published position.
   The worker accepts or declines in their authenticated portal. Acceptance
   rechecks current source tasks, worker admission, trade, qualifications,
   availability, conflicts and position capacity before creating one internal
   planned assignment. A worker can also refresh
   the board and explicitly enroll again once materials are ready. While the
   positions page is open, visible and online, it checks for updates every 30
   seconds and announces new positions, call-outs, application changes and
   revised terms in the page. It is not a background or remote push-notification
   service.
   In the job's work-board panel, each open applicant also shows current
   placement blockers and advisories from the same eligibility rules used by
   the worker portal. A hard blocker disables the office offer control; the API
   still repeats its checks when an offer or placement is requested. This is an
   explainable checklist, not a numeric or AI-generated match score. The
   applicant's declared work areas remain a human-review signal, not a
   calculated travel distance. A normalized place-name mismatch is advisory
   only: workers may still express interest. Matching does not geocode addresses
   or estimate route distance or travel time; nationwide availability suppresses
   this advisory.
7. An admitted worker can register a time-bounded **standby on call** window.
   This is a signal of possible capacity, not a commitment or an absence. If a
   position overlaps it, enrollment remains interest for office review and does
   not create an assignment automatically. After reviewing the schedule, the
   office sends an offer that the worker must accept; placement rechecks all
   normal requirements. The worker may set a minimum call-out notice from 0 to
   168 hours without disclosing why. Replacement call-outs are offered only when
   the time from the recorded offer to shift start meets that threshold; the
   exact threshold is retained and rechecked when the worker responds and when
   an approver reviews replacement.
   A standby window never changes an existing assignment, while a separately
   reported unavailability still blocks conflicting placement.
8. If an admitted worker reports hard unavailability during an assignment,
   the owner can offer a specific replacement call-out to an eligible worker
   whose standby window covers that exact shift. The offer appears only in that
   worker's authenticated portal and is announced there when the positions page
   is open, visible and online; this version sends no background push, email,
   WhatsApp, or other external notification. The worker accepts or declines.
   For a published position whose owner explicitly enabled automatic standby
   call-outs, the durable planner may offer the next eligible, not-yet-contacted
   standby worker after a decline or expiry. It offers at most three workers in
   sequence, with only one open offer at a time; the next offer is created by a
   later planner cycle. Expired offers are recorded and the affected worker is
   notified in their in-app inbox even if they did not open the portal.
   Exhausting the limit or encountering another state that needs review returns
   the event to the owner. Each worker must accept, and replacement still
   requires an owner proposal and a different approver. No email, WhatsApp or
   placement is triggered by this fallback. Acceptance
   is not a placement: the owner must submit the replacement proposal and a
   different approver must approve it. The current assignment stays unchanged
   until approval applies. Every affected planned shift appears in the job's
   work-board panel even when no standby replacement qualifies; the recovery
   action opens the job's planning and disruption review and preselects that
   exact current availability record. If the record changed, the recovery view
   asks the contractor to refresh instead. Health reasons are not displayed or
   retained. If the standby recipient later reports hard unavailability that
   overlaps an offered or accepted call-out, the call-out is revoked; if a
   replacement approval is pending, that approval and its provisional
   replacement are cancelled in the same transaction. Non-overlapping offers
   remain active, and the original assignment is never changed by this cleanup.
   The contractor must review the new absence and start a fresh replacement
   workflow if coverage is still needed. Suspending the worker account also
   revokes outstanding call-outs and cancels linked pending replacements.
9. If all places in a published position are occupied, another applicant can
   join a retained waitlist instead of losing their interest. The worker sees
   their current queue number and can leave the queue. When an assignment is
   released, cancelled or completed, its place becomes available again. The
   office sees waitlisted applicants in queue order and can send a concrete,
   expiring offer; a worker must accept before placement. Normal admission,
   source, material, qualification, capacity, availability and conflict checks
   run again. A waitlist entry is not a
   reservation, assignment or notification; workers refresh the portal for
   changes.

Only the reviewed public position content is listed. Customer names, exact
addresses and internal financial records are not copied into listing cards.
On release, the server checks public title, role, city, description, materials,
equipment and prerequisites against the known client name/company, exact job and
client addresses, email and phone. A detected match blocks publication and
returns only the category of the possible leak, not the matched value. This is a
targeted safeguard, not general personal-data detection; the owner must still
review public free text. The exact address is available in the assigned work
pack.

## Safety and lifecycle

- Published terms are immutable and checksummed. Reusing a publication key with
  different content is rejected. Closing enrollment retains all past assignments.
- Position concepts are retained in the operating ledger using the same
  publication key as the eventual position. They are visible only in the office
  work-board response, are excluded from worker lists, and do not create
  applications or assignments. Publishing converts the same retained record to
  an open position and writes the normal publication audit event.
- Admission, publication, enrollment, and suspension have retained audit events.
- Enrollment rechecks account admission, trade match, active job/position,
  capacity, mandatory approved qualifications through the end of the work,
  availability and assignment overlaps in one ledger transaction. Positions
  linked to tasks also require every linked material need to have a ready status
  and a verified available quantity at least equal to the requested quantity.
- Office confirmation cannot turn retained interest or a waitlist entry directly
  into a planned assignment. The office issues a concrete, revision-bound offer;
  the worker must accept it and current readiness, capacity, qualification and
  conflict checks run again. A worker may instead revisit an open position and
  enroll directly when it is ready and available.
- Material-blocked applications remain visible to the office with the exact
  linked blockers. An offer is available only after blockers clear; worker
  acceptance reruns source, schedule, qualifications and capacity checks. A later
  material discrepancy still blocks normal dispatch/start readiness.
- If a linked work package changes after publication, the worker listing marks
  the position as awaiting owner review and disables enrollment until the
  contractor has reassessed and released current terms. The API still verifies
  the work-package source on every enrollment and placement.
- Positions linked directly to one or more tasks also retain a checksum of the
  published task titles, descriptions, status, dates, duration and requirements.
  A later change to any linked task marks the position as awaiting owner review
  and blocks new enrollment or placement. Legacy task-linked positions without
  this source checksum fail closed and must be reissued before enrollment.
- A repeated enrollment returns the existing assignment; it does not create a
  second one. A full position retains the applicant on the waitlist; conflicting
  assignments or unavailability still fail with an actionable error.
- A full position accepts additional interest into a time-ordered waitlist
  without creating an assignment or reserving capacity. The queue is retained
  and each applicant can withdraw their own entry. The displayed number is
  recalculated when earlier entries leave. After capacity opens, the office can
  send a revision-bound, expiring offer. The worker accepts or declines it;
  acceptance reruns the normal assignment checks and creates no start permission.
- Before publishing a position, the owner can opt into one automatic waitlist
  offer per candidate. When capacity opens, the durable autonomous scheduler
  offers the place to the oldest waitlisted applicant only, through the in-app
  worker portal, for up to 48 hours (never past the shift start). The sweep
  rechecks admission, qualifications, availability, schedule, current task and
  material readiness; it does not create a placement until the worker accepts.
  A pending offer blocks further offers. An ineligible first applicant, a
  declined or expired offer, insufficient response time, or stale/unsafe source
  pauses the queue for owner review instead of skipping or repeatedly contacting
  that applicant. This automation requires the existing autonomous scheduler
  to be enabled; otherwise the queue remains visible for manual handling. No
  email, WhatsApp message, external commitment or independent approval bypass
  is created. The policy is included in the immutable published terms and
  defaults to manual.
- Position fill counts active assignments rather than historical applications,
  so releasing, cancelling or completing a placement makes its position
  capacity available again while retaining the original assignment and audit
  history.
- The assigned worker portal accepts progress or blocker reports only for an
  open task in the current work pack. The server derives worker identity from
  the authenticated account, rechecks the assignment and pack revision, and
  retains the exact task, note and idempotency key. A blocker appears in office
  operational recovery. It does not complete a task, change job-wide progress,
  clear a stop-work condition or authorize a start.
- Admitted workers can report their own unavailability from the worker portal.
  The report stores only the operational time window (or a review date when the
  return is unknown), never a diagnosis or explanation. Overlapping assignments
  appear in the worker view and office availability register; replacement stays
  an explicit planning and approval decision. A worker whose timed standby window
  overlaps the replacement shift is not presented as confirmed replacement
  capacity; the same rule is rechecked when an individual or coordinated plan is
  approved.
- The company-wide recovery queue derives a transparent first-review priority
  and next check from current safety, critical-path, crew-conflict, client-date,
  material, field-blocker and equipment evidence. This is triage guidance only:
  it does not set a contractual deadline, change a commitment or schedule,
  contact a customer/supplier, or replace the owner's review of source coverage.
- Admitted workers can also record generic time-bounded standby windows without
  recording why they need conditional availability. A standby window may set a
  minimum notice from 0 to 168 whole hours; old records and omitted values mean
  zero. New standby windows require a known end time; unknown-return periods
  remain available for unavailability only. This requirement applies to
  replacement call-outs, not ordinary
  published-position enrollment. Standby is separated from absence in
  availability summaries and crew capacity: it does not reduce nominal hours
  or invalidate existing commitments. An overlapping application is held for
  owner review rather than treated as confirmed capacity. Owner confirmation
  remains an explicit internal placement decision with the usual current
  qualification, work-readiness, capacity, assignment-conflict and
  hard-unavailability checks.
- Standby call-outs are bound to one worker, assignment, original unavailability
  period, standby period and expiry. Creation, response, proposal and independent
  approval recheck the source assignment, admission, schedule, role, hard
  availability and qualification. Stale or expired source data blocks approval;
  rejecting the proposal returns the accepted call-out for review and does not
  release existing coverage.
- Owner publication authorizes automatic **internal planned placement**, not
  a customer schedule commitment, payment, external communication, or safety
  clearance. Existing dispatch/start checks remain applicable.
  The published hourly rate is retained in the position terms; enrollment does
  not change a worker's master rate or create a payroll, cost or invoice record.
  A required start release and exact linked task IDs are retained on the
  assignment and enforced by the server, not inferred from free-text notes.
- Suspension blocks portal access, revokes its sessions and prevents new
  enrollment. Existing assignments must be reviewed separately by the owner.
- To change published terms, close enrollment and publish a new position. Do not
  treat this as changing existing assignments; obtain renewed agreement first.

## Authentication and persistence

Legacy work-board accounts use salted scrypt password hashes. Eight-hour opaque sessions are stored
in the company ledger by token hash and held in browser session storage, never in URLs. Sessions
survive server restarts and are revoked on logout, suspension, identity linking, or a new login
for the same legacy account. With operator authentication enabled,
worker credentials do not authenticate against the operator ledger API.
Credential-free loopback mode is a trusted-owner preview, not a multi-user
security boundary: local callers can still use the operator API without a key.
Enable operator authentication before giving another person runtime access.
Registration/login share the existing durable login rate limiter. State-changing
public calls require JSON and the configured trusted-origin policy.

The optional [shared identity service](IDENTITY_AND_MEMBERSHIP.md) supplies a
separate, persistent OIDC access path. It supports one person in multiple
companies, company invitations and owner-reviewed admission. Linking a reviewed
worker to an existing board account is explicit: the owner selects the retained
account and confirms retirement of its password login. The account ID and
applications are preserved, but old passwords and bearer sessions stop working.
Identity-linked admissions/revocations are managed under **Beheer > Bedrijfstoegang**,
not through legacy account admission buttons. Online membership checks fail closed
if the registry cannot be reached. Restore clears company SSO sessions and retains
the existing account-suspension policy.

Migration `073_self_service_work_board` adds accounts, positions and unique
position/account applications. Local backups include these tables. Restore
verification checks their columns and uniqueness constraints; local restore and
hosted import suspend restored accounts pending owner readmission. Credentials
and personal data remain private backup contents and require protected storage.
Migration `083_standby_callout_workflow` adds durable offer state, exact worker
response, source binding, expiry, approval linkage and a unique replay key.
Restore verification checks the new table's retained columns and unique key.
Migration `088_durable_work_board_sessions` adds hash-only worker sessions with
expiry, revocation reason, company-authority write guards and restore validation.
Restores and local-to-hosted migration revoke imported sessions so later account
re-admission cannot reactivate an old bearer token.
Migration `089_position_offer_acceptance` adds expiring offers tied to an exact
published position revision. A worker must accept before the system creates an
internal planned assignment; refusal keeps the original interest or waitlist
entry. Acceptance rechecks eligibility, capacity, source readiness and schedule.
This remains separate from permission to start work and sends no external message.

## Interfaces

- Public entry points: `POST /api/work-board/register`, `/login`, `/logout`.
- Worker authentication: `GET /api/work-board/me`, `/positions`;
  `GET /api/work-board/positions/:id/enrollment-check` returns a read-only,
  personal eligibility snapshot for role, mandatory qualifications, active
  assignments and reported unavailability. It can explain blockers but does
  not reserve capacity or place the worker; enrollment, offer acceptance and
  the owner-only confirmation path repeat the authoritative checks.
  `POST /api/work-board/positions/:id/enroll` with `revision`;
  `GET /api/work-board/positions/:id/pack` for an active own assignment;
  `GET` and `POST /api/work-board/availability` for the signed-in admitted
  worker's own operational availability. Standby submissions may include
  `minimumNoticeHours` (whole hours from 0 to 168); it is returned with the
  retained period. Standby must have a known end time. Replacement call-outs
  that do not meet the recorded notice
  threshold are excluded and fail closed on response or approval. Reporting a
  hard unavailability also returns the worker's affected `invalidatedCallouts`;
  the list contains only call-out and approval IDs, not personal details, and
  any linked pending replacement is cancelled transactionally.
- Worker call-out response: `POST /api/work-board/standby-callouts/:id/respond`
  with `accept` or `decline`; each worker can only read and answer their own.
- Worker interest withdrawal: `POST /api/work-board/applications/:id/withdraw`;
  only the authenticated applicant can withdraw an unplaced application.
  Assigned work remains unchanged and must use the separate availability and
  replacement-review workflow. An admitted worker can request review of a
  release for their own assigned application through
  `POST /api/work-board/applications/:id/release-request`, choosing only a
  bounded reason category. No medical or family narrative is requested or
  retained. The request does not alter the assignment, schedule, or work-pack
  access until an office approver decides it. Approval rechecks the exact
  assignment snapshot and blocks while attendance is checked in; it releases
  the assignment and marks the linked application released in one transaction.
  A rejected request leaves the placement unchanged. This flow does not create
  replacement coverage, notify anyone, or change client dates.
- Position offers: office roles use
  `POST /api/ledger/work-board/applications/:id/offer` with a bounded expiry;
  the applicant uses `POST /api/work-board/applications/:id/offer/respond` with
  `accept` or `decline`. Acceptance creates an internal planned assignment only
  after current placement checks pass; an accepted offer is not start clearance.
- Owner admission: `/api/ledger/work-board/accounts` and `/:id/admit` or
  `/:id/suspend` below that collection.
- Project position drafts/listing and publication:
  `GET` / `POST /api/ledger/jobs/:id/work-board`.
- Close enrollment: `POST /api/ledger/work-board/positions/:id/close`.
- Replacement call-out: owner creates one with
  `POST /api/ledger/jobs/:id/assignments/:assignmentId/standby-callouts`, then
  submits an accepted call-out through
  `POST /api/ledger/work-board/standby-callouts/:id/request-replacement`.
  The existing approval endpoint remains the final independent decision.

## Current limits

This is a functioning local-first increment, not a launched public marketplace.
Localhost is not reachable from another person's phone without a separately
configured network/deployment. Existing EU-hosted readiness, HTTPS and operator
authentication requirements still apply. PostgreSQL runtime acceptance for this
new workflow has not yet been demonstrated.

The work board defaults on only in non-production local mode. Hosted/production
mode requires explicit `CONTRACTOR_AI_WORK_BOARD_ENABLED=true`; setting it to
`false` disables the API locally as well. Leave production disabled until the
privacy, recovery and deployment limitations below are resolved and accepted.

Intake decomposition is currently **suggestions from retained tasks**, not a new
AI scope-estimation engine. Missing trades, dates, rates and resource information
are not invented. Publication still needs owner review. Automated document or
identity verification, email verification/recovery, applicant evidence upload,
automatic replacement, travel-time matching, background or remote notifications
and a complete offline worker-board experience remain future work. A worker may
request review of release from an assigned placement, but cannot cancel it
unilaterally. Open interest can be withdrawn by
the applicant; that action does not cancel or release an assignment. The
waitlist is visible in the portals but currently has no push/email/WhatsApp
notice or automatic candidate promotion. In-page refresh only works while the
positions view remains open, visible and online.
The exclusion of internal intake/coordination checklist tasks is also enforced
in the work-board domain service for both draft creation and publication; a
direct API request cannot turn those tasks into worker openings.
Existing ledger workers are not automatically linked by email: admission refuses
a duplicate active worker address. Use the explicit identity-service conversion
above for reviewed links; do not create a duplicate worker to bypass that check.
The existing field application remains the broader execution/reporting surface.
An identity-authenticated, assigned worker can save the current work pack into
the existing encrypted offline vault and use its queued task-progress, blocker,
question, read-confirmation and governed photo-evidence reports. Offline photos
are limited to 2 MB JPEG/PNG/WebP and follow the saved before/during/after order.
The original file bytes, caption and device timestamp are encrypted in the local
vault; the timestamp is not independently proven while offline. Synchronization
is bound to the same worker and company scope, and the server rechecks the live
task, assignment and evidence set. Legacy work-board password sessions remain
online-only. Offline snapshots cannot verify newer instructions, unlock safety
holds or confirm that materials are physically present. Uploading a complete
photo sequence does not approve it; independent office review remains required.
Task completion and full field execution are not part of this portal flow.

## 2026-09-24 - Assigned work packs can be saved for offline field use

The assigned-work view now exposes the existing encrypted offline vault to
identity-authenticated field workers. The downloaded pack is revalidated before
and after retrieval, encrypted on-device, and bound to the current worker and
company; queued reports synchronize through the existing scoped field-work-pack
routes. Legacy work-board password sessions remain online-only and are told why
the offline action is unavailable. The separate offline view continues to warn
that a stored snapshot cannot verify newer instructions or release safety holds.

Verification: frontend suite passed (97/97); production-bundle Chromium tests
passed (3/3) across assigned worker reporting and offline company isolation;
the mobile offline test uploaded a synthetic JPEG under its original assigned
identity and verified the retained `before` phase and caption server-side.
Focused vault tests passed (4/4); ESLint, production build and bundle-budget
checks passed (577,633/578,500 aggregate gzip bytes; offline field surface
10,040/11,000). The aggregate cap was raised by 2,500 bytes for encrypted photo
capture and a dedicated offline-field asset limit was added; all other surface
caps remain unchanged. No hosted provider, production database, deployment,
commit or push was used.

Lists are bounded to 500 records and the interface is currently Dutch. Legacy
password sessions remain process-local; the new OIDC path has durable encrypted
sessions. Multi-instance/provider/recovery acceptance is still required before
public launch. A self-registered applicant can submit and track a scoped privacy
request from the work board before admission. That account ID is retained as the
worker ID on admission, so privacy restrictions, reviewed profile corrections,
exports and erasure assessments remain attached to one subject across the
transition. Approved restrictions block admission and enrollment; open
applications block pseudonymization. Exports remain operator-reviewed and are
not automatically delivered from the portal. Identity-linked accounts still
require separate review of the shared identity registry. This implementation
is not legal advice or a retention schedule, and a production privacy review
remains required.

## Verification

Behavior tests: `tests/work-board.test.js`, `tests/work-board-api.test.js` (including own-account withdrawal, assigned-work refusal, and full-position waitlist), and
`tests/identity-api.test.js` (including self-scoped availability reports).
`frontend-tests/WorkBoardOffline.test.jsx` covers the identity-only offline entry
and the explicit online-only legacy boundary. Browser coverage is provided by
`e2e/company-offline.spec.js` and `e2e/work-board.spec.js`.
Form constraints, task-scoped progress/blocker reporting, standby holds and owner confirmation:
`frontend-tests/work-board-office.test.jsx`, `frontend-tests/work-board-callouts.test.jsx`, and
`frontend-tests/work-board-material-hold.test.jsx`.
Browser workflow, waitlist rank/withdrawal, task-linked blocker reporting and owner controls: `e2e/work-board.spec.js`.
Use Node 22 and isolated test ledgers. No synthetic applicants or positions
should be introduced into an operator's real database for QA.

## Durable worker notifications

The authenticated worker board includes a retained inbox for standby call-outs,
position offers, confirmed placements, and call-out expiry or withdrawal. Each
notice belongs to one worker, survives refresh/restart, displays unread state
and can be marked read. A new unavailability report withdraws affected pending
call-outs in the same ledger transaction and creates a worker notice; lazy
expiry creates a notice only when the offer actually transitions to expired.
These status notices omit the private reason for the availability change.
Current API polling refreshes notices while the board is open. The encrypted
offline work-pack vault stores a bounded snapshot, labels its save time and
warns that it can be stale; an explicit online sync refreshes it. Background
and external push delivery are not enabled or claimed. Offers state the planned
window, duration, city and expiry. A confirmed placement notice includes the
exact address and planned hours and links to the worker's own placement list.
The message does not grant permission to start work.
When the office approves an answer to a worker's retained field question, the
same approval transaction adds one idempotent `field_reply` notice to that
worker's inbox. It contains the released answer, excludes internal review notes,
and is not created for a pending or rejected draft. The existing scoped work-pack
reply feed remains the authoritative thread view.
When an office-approved customer RFI is explicitly shared with selected tasks,
each currently assigned worker whose task scope matches receives an idempotent
inbox alert in that approval flow. The alert names the affected task(s) and tells
the worker to open the current pack; it never copies the customer message, photo,
AI analysis or answer text. The source, active portal and worker's current task
scope are checked again when the inbox is read. If the customer conversation has
since changed or access is no longer current, the old alert is reduced to a
generic freshness warning. The changed pack hash requires subsequent field
actions to use the newly fetched pack revision. This is an in-product notice,
not push, WhatsApp or email delivery.

## 2026-09-24 - Full positions retain an ordered worker waitlist

Full positions now accept additional applicants into a retained, time-ordered
waitlist. Each applicant sees their current rank and can leave without affecting
an assignment. The owner sees the ordered queue and may confirm a worker only
when a place is open. Position capacity is calculated from active ledger
assignments rather than historical `assigned` applications, so a released,
cancelled or completed assignment no longer occupies a slot. Waitlist placement
uses the existing checks for admission, source freshness, materials,
qualification, availability, overlap and capacity. The queue is not an
assignment, automatic promotion, notification or customer commitment.

Verification on 2026-09-24: the full Node suite passed (704 passed, 46 optional
PostgreSQL tests skipped, 0 failed); all frontend tests passed (94/94); the
production-bundle work-board browser suite passed (2/2). ESLint, Vite production
build, release-contract verification (101 canonical paths) and bundle-budget
verification passed. Aggregate gzip is 575,307/576,000 bytes. No production
database, provider, deployment, commit or push was used.

## 2026-09-26 - Opt-in standby response to reported absence

A published worker-board position can explicitly opt into one automatic,
short-lived portal offer when a reported unavailability overlaps an assigned
shift. The candidate must have independently declared an overlapping standby
period, current admission and trade/qualification/availability checks, and
sufficient notice. For a shift already underway, the exception is limited to
an exact-shift, source-bound missing-check-in unavailability confirmed by the
office, a standby worker whose minimum notice is zero, and at least 15 minutes
remaining for the response. The offer expires within 30 minutes or before the
shift ends, whichever comes first. After a worker accepts in time, expiry of the
response window does not invalidate the pending approval; the replacement still
requires the existing independent approval path. The durable autonomous
scheduler creates an internal inbox offer only; it sends no email or WhatsApp
and never reassigns the shift. A missing or stale source, insufficient response
time, rejection, expiry or other prior callout stops automation for owner
review rather than skipping to another worker or repeating an offer.
The setting is off by default, stored with the immutable position terms, and
omitted from worker-visible position projections. An active, accepted or
approval-pending callout also prevents sending the same worker another
overlapping offer for a different assignment; the worker is not presented with
conflicting shifts before being asked to decide.

Verification: full work-board domain suite passes (35/35), office component
tests pass (19/19), targeted ESLint and production build pass. The build retains the
existing 602.96 kB main-chunk warning. Hosted PostgreSQL concurrency, an enabled
live scheduler, background notifications and independent contractor/worker
acceptance remain unverified. No commit, push or deployment was performed.

## 2026-09-27 - Recovery call-out after a verified missed check-in

An opted-in position may now use the internal standby call-out flow after the
scheduled shift has begun only when office staff confirmed the exact-shift
missing-check-in source. The candidate must have declared standby for the
overlapping shift with a zero-hour minimum notice. The scheduler requires at
least 15 minutes for a reply and expires the offer within 30 minutes or before
shift end. Normal future-shift notice rules are unchanged. Timely acceptance
keeps the separate replacement approval valid after the offer deadline; no
assignment changes or outside messages occur without the existing approval
workflow.
