# Mobile work packs

Implemented 5 September 2026 as a mobile web workflow on the existing ledger.
This is the first execution increment of the three-experience product model,
not a full offline work-pack product or safety certification. A separate native
Android client now exists as [unbuilt source](../android/README.md).

## Using the work pack

A named `field_worker` account with an active worker assignment sees **My work
packs** on Today. Open a job and switch between four sections:

- **Be qualified / Kunnen:** recorded qualification requirements for the assigned
  roles and their assessment. Expiry is checked against now or the end of the
  planned work, whichever is later. Missing requirements are not proof that no
  qualifications are necessary.
- **Know / Weten:** job description, released personal/shared instructions,
  current drawing references, task-specific instructions from an open operational
  recovery case, and assignment-linked pre-task plans, steps,
  hazards, controls, emergency arrangements, stop-work triggers, the worker's
  own acknowledgement, linked permit details, and that worker's own LMRA records.
  Other crew identities and assessments are excluded. When no plan is linked,
  the pack tells the worker to check with the office whether one applies.
  A retained start huddle is projected only onto the exact worker assignment
  and scheduled shift. It shows the planned work, target, site/weather context,
  safety focus, quality hold points and constraints without exposing other
  crew schedules or briefing notes. The latest recorded huddle overlapping
  that shift must include the current assignment; a later crew update cannot
  be bypassed by an older briefing. If it does not, start release is blocked
  until the site lead records an updated huddle. If no huddle exists, the pack
  shows that gap and supervisor start release remains blocked until the site
  lead records the briefing. Adjacent work dates are checked for shifts crossing
  UTC midnight. A huddle is not itself permission to start.
- **Have / Hebben:** recorded materials and active equipment reservations.
  On positions with explicit task scope, materials and equipment must be linked
  to a visible task to be included. Current equipment custody status and due-back
  time are shown without identifying another worker. These records are not
  confirmations of delivery, available stock, or a complete personal-protection list.
- **Do / Doen:** own and shared tasks, assigned quality/photo controls, and links
  to the existing execution workspace and photo/field-report form.

The worker can explicitly confirm reading the displayed version or submit a
question/blocker. Questions create both a retained field report and a linked RFI
in the job, so office users can answer it through the existing RFI workflow.
Replies that could affect instructions or scope remain hidden from the worker
until an independent approver accepts them. Rejected or pending replies are never
shown as approved instructions. Recent questions show the reply state and, after
approval, the answer. Approval also creates one durable, worker-scoped inbox
notice containing the released answer; it is committed atomically with the
approval and is safe to retry. Rejected drafts do not create a worker notice.
No external message is sent. Office users can preview an
assigned worker's pack from Field updates but cannot impersonate that worker's
acknowledgment.

The online, encrypted offline and native Android work packs can retain a
progress percentage and a short execution note against one task visible in the
worker's current pack, or report that task as blocked. The server rechecks that
the task is still in the current worker projection and open when the report is
received. A task report is evidence for office review and recovery planning; it
does not set job-wide status or progress, mark the task complete, or clear a
safety hold. Offline submissions keep the task ID in the encrypted device vault
and synchronize against the exact entry key. A saved local report is not visible
to the office until synchronization succeeds.

The Android source also includes capture for the assigned photo-evidence sets.
It follows the required before/during/after order from that worker's downloaded
pack, writes a temporary camera file through a non-exported Android FileProvider,
removes EXIF/GPS metadata while bounding the JPEG to 2 MB, and stores pending
evidence in the device-key-encrypted vault. Reconnection sends the exact set,
phase, device-reported time, note and stable idempotency key through the governed
private upload endpoint. A stale or rejected phase remains a visible conflict;
an office reviewer still controls release. This is implemented Android source,
not yet APK/device-verified. See [Android field app](../android/README.md).

Warehouse deliveries are also included in the native work pack. While offline,
the worker can record partial received, accepted and damaged quantities plus a
delivery reference, evidence reference and site location. These entries stay in
the encrypted queue and use the downloaded dispatch reference and remaining
quantity as sync preconditions. Source-bound reports and photos synchronize
before receipts; receipts then synchronize in order. Stale dispatches or changed
quantities remain visible conflicts requiring office review. Only a server-
confirmed receipt updates the saved pack, and only its accepted quantity counts
as available on site. This is Android source functionality, not yet device-tested.

Native work-pack downloads also include only safety briefings whose attendee
projection contains the signed-in worker. The worker reads the retained topics,
confirms an explicit attendance/understanding statement, and records an evidence
reference. An offline acknowledgement is stored in the encrypted vault and stays
labelled as not received by the office until authenticated synchronization.
Each acknowledgement carries a hash of the briefing content (title, schedule,
facilitator, evidence reference and topics). A briefing changed before sync is a
409 conflict; it cannot be rebound to the changed text. This records attendance
evidence only: it is not a safety release, proof of competency, or permission to
start work. The native Android path is source-tested but has not been compiled or
device-tested.

Safety records are a source-bound administrative review, not a safety release,
site inspection, or permission to start. Passing record checks are never
presented as authorization. Changed or incomplete sources, expired or superseded
LMRA records, failed integrity checks, acknowledgement gaps, and stop-work
triggers remain visible. Follow the existing safety workflow and applicable site
instructions. The source hash covers this projection, so changes invalidate an
older work-pack read confirmation. Encrypted offline and Android source views
carry the same retained snapshot; offline copies cannot confirm later changes.

## Human Start Release

The online work pack now supports an explicit supervisor start release for one
named worker assignment. Only an owner or designated approver can issue it, and
only during the recorded shift. The server requires that worker's current
work-pack read confirmation, a fully ready dispatch/planning check, current job
and assignment windows, no unresolved accepted scope change, all mandatory
qualifications, at least one current assignment-linked safety plan, current
plan/permit integrity and acknowledgments, and a latest positive unexpired
on-site LMRA for each linked plan. The server also requires a short reason, an
evidence reference, all six supervisor checklist confirmations, and an expiry
within the shift and no more than eight hours away. This strict policy currently
requires an LMRA for every linked plan; site-specific policy configuration is
not yet implemented.

The assigned worker must confirm receipt before the release becomes active. The
worker can decline a pending release or stop active work with a reason; owner or
approver can revoke it. A changed work-pack source, loss of readiness, closed or
paused job, changed qualification/safety evidence, assignment change or expiry
immediately removes active release status on the next online read. Every issue,
receipt and revocation is idempotent and retained in the ledger audit chain.
There is no offline release or queued authorization. This workflow records a
human decision; it does not replace statutory permits, a competent person's
judgment, site-specific controls or the worker's duty and right to stop work.

## API and retained evidence

All routes use the existing authentication, role and job-scope middleware.

| Method and path | Contract |
| --- | --- |
| `GET /api/ledger/work-packs?after=&limit=20` | Active-job list; named-worker assignment filtering occurs before keyset pagination. Maximum page size 50; returns `rows` and `nextCursor`. |
| `GET /api/ledger/jobs/:jobId/work-pack` | Field identity comes from the authenticated account, not a client-supplied worker ID. Returns `pack`; office preview also exposes the active assigned-worker selector via `workers`. |
| `GET /api/ledger/jobs/:jobId/work-pack?workerId=...` | Office preview for an actively assigned worker. A field account cannot use this to impersonate another worker. |
| `GET /api/ledger/jobs/:jobId/work-pack/replies` | Named assigned worker only; returns that worker's latest 20 questions and approved office replies. The online field view checks this lightweight feed every 30 seconds while visible and connected. |
| `POST /api/ledger/jobs/:jobId/work-pack/acknowledgments` | Named field worker only; JSON `sourceHash`, stable `entryKey`, `understood: true`. |
| `POST /api/ledger/jobs/:jobId/work-pack/start-release` | Owner or approver only; names `workerId` and `assignmentId`, current `sourceHash`, stable `entryKey`, reason, evidence reference, six explicit checks and `expiresAt`. Refuses release with 409 and current worker-scoped blockers unless every prerequisite passes. |
| `POST /api/ledger/jobs/:jobId/work-pack/start-release/acknowledgment` | The assigned named worker only; requires `releaseId`, exact current `sourceHash`, stable `entryKey` and `understood: true`. Receipt confirmation activates the current human release; it does not bypass any live gate. |
| `POST /api/ledger/jobs/:jobId/work-pack/start-release/revoke` | Owner/approver may revoke; the assigned worker may decline a pending release or stop active work. Requires `releaseId`, stable `entryKey` and a reason. |
| `POST /api/ledger/jobs/:jobId/work-pack/questions` | Named field worker only; JSON `sourceHash`, stable `entryKey`, `message` (3-4000 characters). |
| `POST /api/ledger/jobs/:jobId/work-pack/progress` | Named assigned worker only; JSON `sourceHash`, stable `entryKey`, `taskId` from that worker's current open work pack, `status` (`in_progress` or `blocked`), `progressPercent` (0-100) and `note` (3-2000 characters). Does not mutate job-wide status/progress; job/task closure and safety clearance are not available through this report. |
| `GET /api/ledger/safety-briefings?jobId=...` | Authenticated assigned field worker receives only their own attendee row and an opaque hash of current briefing content; office roles retain the normal register projection. |
| `POST /api/ledger/jobs/:jobId/safety-meetings/:meetingId/acknowledgments` | Requires the current `briefingContentHash`, explicit `acknowledged: true`, stable `entryKey` and evidence reference. A changed briefing returns 409; the server derives field-worker identity from the session. |
| `GET /api/ledger/jobs/:jobId/work-pack/drawings/:drawingId/content?sourceHash=...` | Current approved PDF, active assignment, exact pack revision, private integrity-checked bytes. |
| `POST /api/ledger/upload` | Multipart private photo evidence; assigned worker token, `jobId`, `evidenceFile`, `category=governed_field_photo`, set ID, required phase, stable entry key, device-reported capture time and optional notes. Server validates assignment, photo signatures, chronological phase, exact retry identity and office review boundary. |

A job-scoped field token without a named `workerId` cannot submit a personal
acknowledgment. Removing an active assignment removes access. Office/owner
accounts cannot submit these personal responses even when they may edit a job.

The source hash identifies the explicit, commercially filtered projection of the
work pack. Job/task execution status changes alone do not invalidate reading or
an already queued progress report; changed instructions, scope, planning,
requirements or recorded resources can. The interface identifies changed sections.
An office recovery instruction is scoped to the exact blocked task and assigned
worker, appears only in that worker's current pack, and changes its source hash.
The online pack and both offline field clients display it from the downloaded
version. The web vault encrypts the complete pack; the Android source uses its
Keystore-backed vault. While offline, the worker can queue a read confirmation
and later report the same task back in progress. Both retain the exact pack
`sourceHash`; synchronization preserves acknowledgement-before-progress order,
and the server rechecks the worker, task, current version and ordering. A source
change or revoked assignment is a conflict, never automatically rebound to a
newer pack. A queued local entry is not evidence received by the office until
sync succeeds. The Android change is source-level only and has not been compiled
or device-tested. Recovery instructions never release a permit, safety hold or
other safety control.
Each active assignment for the named worker includes its own role, scheduled
start/end and allocated hours. The online and encrypted offline field views
show these worker-specific shifts separately from the broader project schedule;
an assignment-time change changes the work-pack hash and requires a fresh read
confirmation. Rates, costs and other workers' assignments are not included.
The online work pack also shows the current shared dispatch/planning status
(`ready`, `ready_with_warnings`, `needs_plan`, `approval_required` or `blocked`),
counts of blockers/missing items/warnings and its check time. It exposes no
dispatch blocker text that could disclose another worker's identity. This is a
snapshot for awareness, not an operational release or permission to start; the
supervisor and site-specific safety process remain authoritative. Refresh the
work pack to recalculate this status. The counts, status and check time are
excluded from the worker-instruction source hash because field reports can
change dispatch readiness without changing the worker's instructions.
Every acknowledgment, question and progress report retains that projection in
the ledger audit trail, so the shown source survives later edits. Responses have
no safety-clearance effect.

For a work-board position with explicitly linked tasks, the resulting assignment
retains the position and exact task IDs. Its field pack includes those linked
tasks plus tasks directly assigned to that worker or where they are the named
supervisor; other unassigned job tasks and checks linked to other tasks are
excluded. A position with no linked tasks keeps the legacy shared-task view, so
it does not imply an unrecorded scope boundary. Position/task links also remain
source-current at publication and placement. For a position explicitly
published with **start release required**, the resulting assignment retains the
policy and exact linked task IDs. The
server rejects an `in_progress` report for those tasks unless that assignment
has a current, unexpired release for the current work-pack hash, the worker has
acknowledged that release, and all release-readiness conditions still pass.
Blocker reports remain permitted so workers can report unsafe or incomplete
conditions. Positions without this explicit policy retain the existing progress
workflow. Offline reports are revalidated when synchronized and cannot use an
expired or changed release.

Reuse the same entry key after an uncertain request outcome. An identical retry
replays the retained result without another report/approval/progress record. Reusing a key with
different content returns 409. New responses to an outdated source hash also
return 409 and require refreshing the work pack. The UI retains the current
retry key in component memory, not across a reload or app restart.

## Boundaries and verification

The new projection excludes commercial fields, other workers' named tasks and
unreleased personal instructions. Explicit task-linked work-board positions now
also limit shared tasks, task-linked checks, and governed drawings explicitly
linked to visible tasks to the retained position scope; material requirements
and dispatched site issues follow the explicitly linked material requirements.
Legacy positions without linked task IDs retain the existing shared-task and
all-current-drawings behavior. Position-scoped packs omit unlinked equipment;
legacy unscoped packs include active reservations. The general field job-detail
projection now reuses the same task selection for tasks, task-linked materials,
active tool reservations, custody summaries, current drawings, and task-linked
progress/quality records. The general drawing list applies the same current
and assigned-task scope. Both drawing download routes additionally require an
approved, integrity-valid PDF; commercial issue packages remain office-only.
This closes the former wider secondary projection and direct-download paths.
Worker orientations and site-access records are limited to the current worker
and active assignment. Safety briefings require that worker's retained attendee
record, and pre-task plans require an attendee record linked to that worker's
active assignment; standalone briefing and plan lists apply the same rules.

Production is also scoped to assigned work: each baseline line must link to a
same-job task before it appears in a field work pack or can accept a field
production entry. Field projections include only the authenticated worker's
entries for visible linked tasks, with task-level quantities and personal crew
hours; peer output, crew aggregates, labor budgets, cost codes and approval
metadata remain office-only. Office can retain unlinked lines for its own
tracking. Legacy baselines without explicit task links stay hidden from the
field view until an office revision links them; retained output prevents changing
or clearing its task link.

The generic field job dossier includes only submittals in an operationally
released state whose exact approval record is approved. It returns a minimal
reference, not attachments, internal reviewer/responsible-party details or
approval metadata. Draft, rejected, pending and unapproved items remain office
records. Task-linked submittals are restricted to matching visible tasks.
Job hazard analyses follow the same exact-decision rule: only approved JHAs
appear, with their work method, hazards, controls, PPE and stop-work triggers.
Internal reviewer, assignment and note fields are omitted. Task-level JHA links
are retained inside the approved JHA source definition. A task-scoped worker
receives only an intact approved JHA linked to at least one visible task, and
only the overlapping task IDs are returned. A missing link, changed safety
definition, changed approval snapshot or JHA for another task is withheld. The
field dossier and encrypted offline work-pack snapshot use the same projection.
The office safety-pack action creates a new reviewable task-linked JHA draft if
the active tasks are not covered by an exact matching JHA; it copies any
existing hazard/control content only as a starting point and requires fresh
human review. Older unlinked JHAs remain visible to unscoped legacy assignments,
but do not silently apply to newly task-scoped positions. A JHA is still not a
work permit, worker briefing acknowledgement or start release.
Each active work task also receives an explicit office applicability review:
JHA required or reviewed as not required. New tasks begin unreviewed, and a
change to the task title, description, required trade or linked materials makes
the retained review stale. Only an owner or approver can record that a JHA is
not required, and every decision needs a reason, stable replay key and audit
entry. The worker sees only the status for their visible tasks, not the office
rationale. Start release fails closed for unreviewed/stale decisions; a required
JHA must be intact, approved and linked to that task. Its assigned pre-task plan
must freeze a task scope that covers the same task; a plan carrying the same JHA
for another task is insufficient. New plan revisions retain that scope in a
versioned approval snapshot, and the current JHA must still cover each selected
task. Existing version-one plans remain readable but gain no inferred task
coverage. The safety queue includes visible tasks from current assignments,
including unscoped legacy assignments. This is a review control, not a legal
determination that a JHA is or is not required.
Safety data sheets in both the field dossier and mobile knowledge view must be
current, unexpired, integrity-valid and backed by their exact approved decision.
The view carries only product identity and practical hazard, PPE, first-aid,
fire, handling, spill, disposal and emergency details. Unapproved legacy records
cannot appear merely because their stored status says current. These sheets are
still job-wide rather than mapped to individual tasks or materials.

This is not proof of universal company-level isolation or a complete per-task
scope map across every older safety/project collection. Records without an
explicit task relation still follow their existing assignment/job-level rules,
and specialty collections use the existing job-detail read limits; neither is a
completeness certificate for all safety/project records.
The online summary shows drawing and safety-plan references/statuses. Current
approved drawings and SDS revisions can be retrieved only through worker-bound,
work-pack-version-bound routes that recheck approval, source integrity, PDF
signature and checksum. The encrypted offline pack can retain both document
types; the combined cap is 50 PDFs and 12 MB, with an 8 MB per-file maximum.
Existing packs must be refreshed after SDS file metadata changes the pack hash.
Adding file metadata changes the work-pack hash: refresh/re-download existing packs
before submitting new responses. Exact previously retained retries remain replayable.

The online form still requires connectivity. The native Android app checks its
authenticated, assigned-worker reply feed every 30 seconds while the selected
pack is visible and a network is available. New approved answers are merged
into the encrypted vault and announced in an accessible status line without
rebuilding the work screen. Polling ends when the activity leaves the foreground
or another screen opens; no background service or push channel is added. The
separate encrypted offline work folder retains downloaded work-pack snapshots and queues questions, read
acknowledgments and progress/blocker reports across reloads. A synchronized
question remains in the local pack; the Android app refreshes replies while open.
The web field view also polls the scoped reply feed every 30 seconds while visible
and connected, and announces a newly approved reply in the page's status region.
This is not a push notification.
The native Android home screen also offers worker-wide unavailability reporting.
The report can be saved in the encrypted, account-scoped queue while offline;
the queue clearly marks that it has not reached the office. Synchronization
requires the original authenticated worker and server. A server-confirmed result
and any affected assignments remain in the encrypted vault until the worker
reviews them, including across an interrupted sync. The form does not ask for or
retain a health reason, and it does not change an assignment. Expired offline
workspaces cannot create new queued reports. The Android implementation remains
source-only until SDK compilation and device testing. See
[Connected experiences](CONNECTED_EXPERIENCES.md) for expiry, conflict handling,
account matching and recovery.
Existing field-evidence queues retain their separate behavior. Full safety
briefings and external push notifications for new replies are not added.
Customer photo conversations, local model analysis and a gated WhatsApp adapter
are implemented separately and described in that same guide.

Localhost opens on the computer running the app, not a separate phone. Real-phone
access needs a deliberately configured authenticated HTTPS deployment/network
route. This change does not expose the local server to the network.

Focused tests cover backend scope and replay safety, stale revisions, retained
snapshots, API impersonation attempts, frontend controls and authenticated mobile/
desktop browser interaction, including accessibility, language switching and
connection loss. The mobile offline browser flow retains a synthetic governed
photo inside the encrypted vault, refuses cross-company synchronization, then
uploads it under the original worker identity and verifies the retained phase and
caption. That browser test does not exercise the native camera. Native offline
capture time is device-reported, native source is not yet compiled or installed,
and independent approval is still needed before the photo sequence can support
task completion.

Approved SDS revisions now retain explicit links to same-job material
requirements inside the integrity-checked approval snapshot. Office replaces
and can review these links in the SDS register. When a position has explicit
task scope, its work pack, field job dossier and SDS endpoints include only
current approved sheets linked to a material requirement used by a visible task;
cancelled material links are excluded. Revisions inherit links by default but
can deliberately replace or clear them, which creates a different approval
source. A task-scoped position therefore does not receive a job-wide SDS merely
because it exists. Unscoped legacy assignments retain the earlier approved
job-wide projection until they are converted to explicit position task scope.

Active job materials also carry an audited SDS applicability decision. New
materials default to unreviewed and block start release until office review;
only an owner or approver can record that an SDS is not required. Linking a
governed SDS to a material makes SDS required immediately, including while the
revision awaits approval. The worker's release stays blocked until a current
approved PDF is included in the pre-task plan assigned to that position. The
field work pack shows which material is blocked and why; the office register
records the decision reason and stable retry key. This is a local SQLite/API
verified workflow; hosted PostgreSQL parity and independent site acceptance
remain unverified.

An accepted scope change is included as field instruction only while its
retained variation source remains integrity-valid and work-authorized. If that
evidence no longer verifies, the normal scope text is withheld, an office-review
blocker is shown to the worker and start release is blocked until the source is
reviewed. A changed SDS requirement similarly invalidates the existing
work-pack-bound start release; the worker cannot continue to rely on a prior
release for a different safety basis.

Approved submittals also appear in the mobile Know view and encrypted offline
work pack. A field projection requires the exact approved task and attachment
sets and the approval-time PDF manifest (document ID, filename, MIME type,
size and SHA-256); only actual same-job retained PDFs with a valid digest and
size within 8 MB are exposed. Any attachment or source change invalidates the
pending approval or hides an already-approved file. A private, no-store
download route rechecks worker, approval, task scope and source hash before
and after storage access. The generic document-content route denies field
workers direct access to submittal source IDs, preventing a bypass of task
scope. Offline
submittal files share the existing 50-file, 12 MB combined work-pack limit.
Draft, pending, changed-scope, unlinked peer-task and arbitrary text references
do not grant document access. The PDF is technical reference only and does not
change work scope, price, dates or start authorization. The office selects
attachments from retained same-job PDFs with a current checksum rather than
entering free-text references; older references remain historical and do not
grant field access. Focused SQLite service, API, browser-view, offline-download
and production-bundle browser tests pass, including PDF upload, selection and
persisted document ID. Hosted PostgreSQL parity and independent field
acceptance remain unverified.

## Bounded document downloads and on-demand loading

The three offline PDF kinds share a single verifier. It allocates only the
approved file size, reads progressive chunks within that bound, releases the
stream lock on failure, and rejects wrong HTTP/MIME responses, missing bodies,
overflow, truncation, changed checksums and non-PDF signatures. The existing
8 MB per-file and combined 50-file/12 MB work-pack limits remain unchanged.
Routes still bind the job, document and current work-pack source, with redirects
refused and a 30-second fetch timeout.

The online worker view does not load the PDF or encrypted-vault modules merely
to display a pack. Individual downloads load the PDF verifier; saving an offline
folder also loads the vault module. The offline installation still includes both
modules. A synchronous save lock rejects duplicate submissions and disables the
passphrase while saving. A changed live source or failed download prevents vault
retention and leaves the passphrase available for a deliberate retry. This is
not an extension of offline authorization or a safety release.
