# Offline work, customer conversations and channel analysis

Implementation status: 26 September 2026. These additions connect the existing
Node ledger and three product experiences. They do not replace the broader
[completion matrix](GOAL_COMPLETION_MATRIX.md) or certify live providers.

## For contractors and customers

In **Clients / Klanten**, select an assignment under **Client conversations /
Klantgesprekken**, then an active, approved client access link. The office and
that link's customer share a private conversation. Different links, even for the
same assignment, have separate conversations. Create/release client access using
the existing portal-access workflow; a pending or revoked link cannot read chat.

Customers can send text and one JPEG, PNG or WebP photo per message, up to 5 MB.
The timeline supports reply references, older messages, manual refresh and
20-second polling while the page is visible and online. New counterpart messages
are announced without forcing the reader to scroll. Photos are
retrieved through an authorized endpoint, not a public evidence URL. Text is
rendered as text, never injected HTML. The office sees drafts as well as received
and published messages; the customer sees their own messages and published replies.

### Dashboard resource boundaries

Production React and its CommonJS interop helper live in the same immutable
runtime asset. The runtime no longer imports the changing entry chunk. A real
two-build regression verifies that changing a lazy screen changes that screen's
asset identity but not React's bytes or filename. This reduces avoidable runtime
cache invalidation across screen updates; it is not an end-to-end latency or
deployment-cache guarantee. Existing hashed-asset caching and no-store HTML
remain unchanged.

Operator, customer and field forms share one draft autosave coordinator per
browser session-storage instance. Each form keeps its own debounce deadline,
but the page uses one timer and one page-hide handler. A flush reads the draft
storage inventory once, applies the existing secret/file filtering, 128 KiB
per-draft limit, 1 MiB total limit and 12-hour expiry, then writes due drafts.
Successfully saved values are released from the coordinator and are not written
again merely because the page is hidden. Failed writes retry on page-hide rather
than starting an unbounded timer loop. Explicit removal or scope clearing also
cancels waiting writes, so closing or signing out cannot resurrect a removed
draft. Browser-storage failures do not replace or report a successful ledger
write. This is best-effort local draft recovery, not an offline transaction
queue or server backup.

The opportunity editor is also a separate on-demand screen. Its form state and
forecast-to-ledger conversion no longer belong to the dashboard component, so
typing does not render dashboard siblings. The editor retains the existing
operator/company-scoped `opportunity` draft key and API payload. Explicit close
clears that draft, while reload restores an unfinished editor and its values.
Catalog reads run together only after opening and are aborted on close. A slow
screen download leaves a cancellable modal instead of suspending the dashboard.
These changes do not enable external communications or commercial commitments.

The dashboard's new-message inbox is an independent screen module. Viewing the
daily overview does not load the full conversation editor, analysis controls or
photo viewer just to show unread messages. Photo previews in client deliveries
also load their own viewer without importing the conversation editor.

The inbox has at most one active browser read and waits 30 seconds after a read
finishes before polling again. Leaving the daily overview, hiding the browser
tab or going offline aborts that read and clears its timer. Returning to a
visible, online overview obtains fresh data. Late replies from an abandoned
read cannot replace newer inbox data. This does not cancel an already executing
database operation on the server and does not mark a customer message reviewed.

Photos retain the same authorized endpoint and company/token boundary. One
shared visibility observer per document defers private downloads until a photo
approaches the viewport (256 px margin). Hidden or zero-sized previews do not
start reads. Browsers without a working observer retain eager loading rather
than losing photo access. Conversation previews reserve a 4:3 frame; delivery
gallery frames retain their 220 px height. Images decode asynchronously and
remain uncropped inside those frames.

Downloaded photos remain in their mounted viewer for fast back-scrolling; this
is not a bounded cache for an entire visited timeline. There is no new persistent
media cache or cross-client byte reuse. Scope changes immediately hide old media,
abort outstanding reads and revoke temporary object URLs, as does unmounting.
The existing named component exports remain available for compatibility. Offline
message queues and work-package completeness are unchanged.

An office reply is first saved as a draft. Resolve its approval in Approvals, then
use **Publish approved message** in the conversation. Approval and publication
are separate steps. Neither is proof of WhatsApp delivery or legal acceptance of
a variation. The existing choice/variation approval workflow remains authoritative.

### Customer request to formal variation draft

An office operator can convert a current local-analysis finding classified as a
customer request into a formal variation draft. The exact inbound quote, message
hash and analysis identity are retained in the integrity-checked variation
snapshot. Office must review and enter scope, net EUR estimate, calendar-day
impact and risk before creation. A retained accepted quote or positive contract
baseline is required. Creation leaves the change order as a draft with internal
approval pending; it does not issue a client package, send a message, change the
contract value, authorize work or alter the schedule. The standard variation
approval, issue, verified client acceptance and implementation gates remain
separate. A local model suggestion is not a verified scope or impact estimate.

Current analysis findings classified as a client question, request, issue or
contradiction can also be assigned to an internal RFI with a named responsible
person and follow-up deadline. Contradiction findings retain the exact customer
quote, source hash, analysis identity, model suggestion and uncertainty. The
office must write the actual comparison/research question; this records a
dispute for investigation and does not decide which account is correct, change
contract scope, or state that either party accepted a price or variation.

### Approved RFI answer back to the customer conversation

When an internal RFI created from a current customer-message finding has a
recorded answer and that exact answer is approved, office can prepare it as an
outbound chat draft. The draft quotes the approved answer verbatim, replies to
the original customer message, and retains the RFI ID, approval, response hash,
message hash and analysis identity in its audited source record. It is offered
only while the originating conversation and analysis are still current. If the
customer has added new information, staff must refresh and reassess before
creating a response draft. A prepared response remains private: an authorized
approver must separately approve that exact outbound message, after which an
operator explicitly publishes it. This does not send a WhatsApp message or
claim customer acceptance.

Exact message retries use a stable entry key and return the original receipt.
Changing content while reusing a key fails. Text, reply reference, source-linked
analysis reference and an uncertain-send retry key are recovered from
account-scoped browser session storage for up to 12 hours. These drafts are not
encrypted or cross-device. Photos are not stored and must be selected again
after reload. Avoid entering sensitive details on a shared device; logout clears
the office operator's scoped drafts.

### Approved field report to a customer conversation

Office users can choose a client-visible field report after its approval and
prepare an editable, private message for that job's active client conversation.
The draft is bound to the exact report revision and source hash; the customer
portal never receives the report provenance or internal workforce information.
The draft can be created only for a currently approved report still marked
client-visible and an active client access scoped to the same job. Exact retries
reuse the original draft. The conversation timeline labels the report source
for office users only.

The message remains private until its own communication approval is resolved,
and publication remains a separate explicit action. Current report content,
approval, client visibility and portal access are revalidated both when the
message is approved and when it is published. A stale or revoked source fails
closed. This is not WhatsApp or email delivery and does not imply that a client
has read or accepted the report.

New office completion requests include a current operational check. Incomplete
tasks, linked material shortages, unresolved safety/site/quality blockers and
open disruption-recovery cases are shown to the approver and prevent the job
from being marked operationally complete. The check runs again when the
approval is resolved, so changed evidence cannot silently pass. Client decisions,
formal variations, handover, invoices and payments remain distinct follow-ups;
operational completion does not claim customer acceptance or settlement.

### Customer conversation while offline

After opening a valid portal link online, the portal prepares its public offline
shell and retains an encrypted, device-local snapshot of the project and recent
conversation. If the network drops, the customer can compose text and attach one
JPEG, PNG or WebP photo (up to 5 MB). The encrypted IndexedDB outbox survives a
page reload and labels the item as **saved on this device only**; it is not shown
as received by the contractor until the authenticated server acknowledges it.
On reconnect, the exact content and idempotency key are synchronized so a retry
does not create a duplicate message.

The outbox is limited to 10 messages and 20 MB total, with seven-day retention.
Its AES-GCM key is derived in memory from the portal token; the raw token is not
written to storage. A separate encrypted project/conversation snapshot is a
last-known view and may be stale; cached photos are metadata only. Online 401/403
responses clear portal and conversation snapshots, but a disconnected device
cannot learn that access was revoked and local copies cannot be remotely erased.
Customers can explicitly remove an unsent item.

This offline capability is limited to customer chat. Choices, change-order and
contract decisions, partial-delivery responses, feedback and other portal actions
remain online-only. The portal must first be opened online with an active link
and a controlling service worker. Browser storage eviction or device loss can
remove queued data. Photos upload only after reconnection through the same
authorized private endpoint. This is not WhatsApp delivery, push notification,
offline AI analysis or native-app acceptance.

New messages submitted through the older `/api/client-portal/messages`
compatibility route are transactionally linked into the same access-scoped
conversation, preserving the original communication ID and timestamp without
creating a duplicate record. Office users can also explicitly review older
inbound text records for an active access link and import them one at a time.
Only records that retain an exact matching portal-access identifier are listed;
owner/approver permission is required to import. The original communication ID
and timestamp are preserved, and the import is audited and idempotent. Records
with missing or mismatched provenance remain untouched. This review does not
send a message externally. Existing project updates also remain separate. Chat
polling stops while the page is hidden or offline;
there is no background notification or real-time push. Separately, the field work pack checks for approved replies and
the worker positions board checks its own updates while open, visible and online;
neither provides background or remote push notifications.

## Offline work folder

1. Sign in as a named field worker with an active assignment. Open its work pack.
2. Expand **Offline werkmap**, choose an offline passphrase (10-200 characters),
   and select **Werkpakket offline bewaren** while online.
3. Open `/field-offline.html`. After download, this page can reload without a
   network connection. Unlock using the passphrase to see saved work packs.
4. Explicitly save a question, read acknowledgment, or progress report locally.
   Progress can be marked in progress or blocked, with a percentage and note;
   the queue survives browser restarts. A local-save receipt is not an office
   receipt.
5. Reconnect, sign in with the original worker account if needed, then synchronize.
   Each write checks live assignment access and the original work-pack revision.
   Changed-source responses remain visible as conflicts, not silently reassigned.

The vault uses AES-GCM-256 and PBKDF2-SHA-256 (600,000 iterations), a random salt
and a fresh IV for each write. IndexedDB retains only the encrypted record;
authentication tokens are not included. A compare-and-write check prevents two
windows silently overwriting each other's vault. At most 20 work-pack snapshots,
100 queued responses and 24 MB of serialized plaintext (including base64 PDF files)
fit in one device vault. Older array-encoded encrypted records remain readable;
new writes use compact base64 ciphertext. Existing field
photo/evidence outboxes are separate and retain their own storage behavior.

Saved access expires after seven days. Expired data is retained for recovery, not
deleted: reconnect and sign in as the original account, then unlock the offline
page to recover unsent responses. Sync still checks current assignment and source.
Downloading into an expired vault is blocked; recover its queue, explicitly erase
the old vault and download again. Lost passphrases cannot be reset to decrypt it.

Expiry relies on the device clock and application behavior; it is not remote
erasure or a cryptographic time lock. Remote revocation cannot invalidate bytes
already downloaded on a disconnected device. Unlocked data exists in memory, so
use an encrypted, screen-locked device, a private browser profile and the explicit
lock/erase controls. Browser storage eviction can lose unsynchronized records.

The service worker caches only versioned public application JS/CSS and the offline
HTML entry. It does not cache APIs, tokens, login responses or private evidence.
Use localhost for development or authenticated HTTPS on a deliberately configured
phone-accessible route. Localhost on a phone is not the contractor's computer.

Current approved PDF drawings are downloaded through an assignment-scoped endpoint,
with exact byte count, PDF signature and SHA-256 verification before encryption.
Limits are 8 MB per PDF, 12 MB of files per pack and 50 drawings. A failed download
does not replace the old vault. Revisions and assignment access are checked before
and after retrieval; the pack is checked again before retaining it. In the offline
**Weten** section, **PDF openen** opens the decrypted file using a temporary browser
blob URL. Locking removes those URLs from this page, but cannot recall bytes already
opened in another tab or exported. Larger drawings must be handled online.
The download icon explicitly exports a decrypted PDF outside the encrypted vault;
manage that copy using the device's storage/security controls.

**Scope still open:** the [native Android implementation](../android/README.md)
has not been compiled or accepted on a phone. This tested offline path is the web
work-folder. Safety-plan entries remain references; full briefings are not
downloaded. Not every field action is available on the
offline page, and company-level isolation in all older screens is not established.
Questions go to existing office review; live free-form worker chat is not added.
Both native and web field work-pack screens now check the assigned worker's
approved-answer feed while open and online, and stop polling when hidden. This
does not provide background notifications or a general two-way chat.

## Optional local AI analysis

Analysis is off by default and uses the native Ollama `/api/chat` interface. It
does not require an OpenAI account, call an external AI provider, install models
or download model weights automatically. Configure the runtime environment:

```dotenv
CONTRACTOR_AI_CHAT_AI_ENABLED=true
CONTRACTOR_AI_CHAT_AI_URL=http://127.0.0.1:11434
CONTRACTOR_AI_CHAT_AI_MODEL=your-installed-local-model
CONTRACTOR_AI_CHAT_AI_CONTEXT_TOKENS=16384
CONTRACTOR_AI_CHAT_AI_VISION_ENABLED=false
CONTRACTOR_AI_CHAT_AI_AUTO_ANALYZE=false
```

The model name must identify an actually installed local model. URLs are limited
to literal loopback HTTP, with no credentials/path/query, and cloud-labelled model
names are rejected. This cannot prove that a separately managed model server
never proxies data: disable cloud features and enforce an appropriate egress
policy. In a container, loopback is inside that container; a separate networked
Ollama service is not accepted by this adapter as currently implemented.

By default, office users explicitly request analysis in the conversation. Set
`CONTRACTOR_AI_CHAT_AI_AUTO_ANALYZE=true` as a separate opt-in. The server scans
active conversations for unreviewed inbound client messages and places the
current source version in a durable local queue. Leased jobs resume after a
restart, retry temporary local-model failures with bounded backoff, and become
terminal after eight attempts. A source or model-configuration change
supersedes stale queued work; the source is rechecked after inference and again
before retention. The queue stores scoped IDs, hashes and status, not a second
copy of customer text or photos. The interface polls queue status while the
conversation remains open. Disabling the separate opt-in stops background
processing. Merely opening a conversation does not initiate model execution.
Analysis remains an internal source-linked proposal: it does not create RFIs,
task changes, replies, approvals or external sends. The Windows local-model
verification script explicitly keeps automatic analysis off.

For local development, `npm run dev:api:local-ai` starts the local API with
manual text analysis enabled for `qwen3:4b` (override with
`CONTRACTOR_AI_LOCAL_MODEL`), a 4096-token context and image/automatic analysis
disabled. Ollama must already be running on loopback with that model installed.
The office conversation's **Test local model connection** action (also available
in Dutch) checks only the local runtime version and installed-model list; it sends no conversation
text or photos. It requires office authentication. Stop/restart an existing API
process deliberately before using the command so the database has one writer.

The complete customer-visible conversation is paged oldest-to-newest, up to 1,000
messages and 2 MB of source JSON. It includes inbound customer messages and
published office replies; unpublished office drafts are excluded from model input
and do not invalidate analysis. It is supplied as sequential batches of at most 30
messages and the smaller of 60,000 bytes or `contextTokens - 3000`, reserving
context for instructions and output. Each model request has a 60-second timeout
and a 128 KB response limit. A source or whole conversation exceeding these
explicit local limits fails visibly; older messages are never silently omitted.
The retained analysis covers every included message and reports its source and batch counts.
No tools or external actions are exposed to the model. Output has a JSON schema.
Every retained text finding must contain an exact quotation present in its cited
message. Suggested actions and uncertainty remain proposals, never approvals or
factual guarantees. Context must be 4096-32768 tokens; at 4096, each batch
supports at most 1096 bytes of source JSON. `think: false` bounds avoidable
reasoning output for compatible models; `keep_alive: 0` unloads model memory after
a request. Neither setting guarantees completion within the request's 60-second
deadline.

Enable vision only with a tested local vision-capable model. Up to the last three
photos in that source window, capped at 10 MB total, are privately read and hash
verified before submission. Observations must reference an actually submitted
photo's message ID and SHA-256. No model output can certify dimensions, hidden
construction, compliance or safety. Without vision, photo metadata is available
but image pixels are not analyzed. The retained result records photo counts.

Outputs retain model, schema version, source projection and timestamp in the audit
trail. Identical current-source/model requests reuse the result. Sources are checked
again after a model response. The office may copy a finding into a draft reply;
its identity and quotation are retained and checked before saving. A stale analysis
cannot create a new source-linked draft. Exact retry of an already saved draft is
still allowed. Analysis does not automatically change tasks, price, planning or
contract terms. A verified quote is evidence of what was written, not proof that
the interpretation is correct. There is no cross-conversation retrieval; the full
retained history is analyzed within the explicit limits above. See the local
evaluation record below; correct source quotations
alone did not establish adequate interpretation quality.

An office user may explicitly convert a current `question`, `request` or `issue`
finding into an internal RFI. The user reviews/edits its title and question and
sets a responsible person and future follow-up date. The operation rechecks the
active conversation, current analysis identity, exact inbound message and quote;
it retains those source details plus the model suggestion and uncertainty on the
RFI. Exact retries reuse the original result and changed content under that key
is rejected. A stale analysis cannot create a new RFI. This is internal follow-up
only: it does not send a client message, change price/scope/schedule, or represent
that the AI interpretation is correct. A separate human action is still required
to answer/resolve the RFI through its normal approval flow.

### Local evaluation on 5 September 2026

Portable Ollama 0.33.3 was downloaded from its official release, SHA-256 verified,
and started on `127.0.0.1:11434` with cloud disabled, one parallel request and no
permanent model residency. Toolchains/models are ignored local files under
`tmp/toolchains`, not repository assets or Windows startup installations. An
existing trusted installation can be restarted with `scripts/start-local-ai.ps1`.
It deliberately neither downloads models nor enables the application integration.

`scripts/verify-local-conversation-model.js` makes a real adapter request using a
synthetic Dutch refusal plus a measurement question. It checks cited evidence,
preserved refusal, retained question and separate intents, and exits nonzero on
failure. This is a narrow smoke check, not a contractor-domain benchmark.

| Actual model | Observed result |
| --- | --- |
| Qwen2.5 1.5B Instruct | Initial technical/schema call succeeded (~17 s), but interpretation omitted the explicit refusal; not accepted. |
| Qwen2.5 3B Instruct | Strict smoke failed (~35 s; ~41 s with example): did not retain the refusal as a separate meaningful finding. |
| Qwen3 4B, no thinking | Strict smoke failed (~57 s): separated intents, but suggested asking the refusing customer to accept the price. |

These runs used 4096-token context and no real client data or external actions.
The application analysis switch remains **off**. No local vision model, full
conversation-route live evaluation or operational quality acceptance was completed.
Evidence logs remain in ignored `tmp/toolchains/model-*-evaluation.log` and
`model-3b-fewshot.log`. Do not redefine a schema-valid response as quality success.

## Optional WhatsApp adapter

The portal works without WhatsApp. The optional adapter uses Meta's Cloud API
directly; no archived SDK is installed. All fields below use the
`CONTRACTOR_AI_WHATSAPP_` prefix:

| Field | Requirement |
| --- | --- |
| `ENABLED` | `false` by default; explicitly enable only after operator review. |
| `TOKEN`, `APP_SECRET` | Account credentials injected through the runtime environment; never commit them. |
| `VERIFY_TOKEN` | Operator-generated webhook verification secret of at least 32 characters. |
| `PHONE_ID`, `WABA_ID` | Explicit numeric sending phone and business-account identifiers. |
| `VERSION` | Explicit supported Graph version in `vN.N` format; no implicit moving default. |
| `PRIVACY_REFERENCE` | Reference to the operator's reviewed privacy/provider arrangement. |
| `COST_REFERENCE` | Reference to reviewed commercial terms and operational budget controls. |
| `VERIFICATION_REFERENCE` | Reference to retained provider/account verification evidence. |

References are operator attestations, not automated checks of contracts, budgets
or account ownership. No code here establishes EU-only processing by Meta or
guarantees DPA compliance. Resolve provider/privacy requirements before activation.

The callback is `/api/integrations/whatsapp/webhook`. Expose it only through a
deliberately configured HTTPS deployment/tunnel. The integration requires dashboard
authentication to be enabled and the runtime to pass its readiness gate. GET
verifies the subscription challenge; POST verifies HMAC-SHA256 over the exact raw
body. Wrong account/phone events fail, and unknown senders are not assigned to jobs.
Verification query secrets are excluded from audit-safe request log paths.

For each active conversation, the owner registers a phone number plus identity and
consent references. Its binding requires a separate resolved approval before intake
or sending. One number cannot be bound to two active conversations. Revoke the
binding before transferring it; revocation or portal expiry blocks future access.

Inbound text/images enter the same immutable, access-scoped timeline. Provider IDs
deduplicate retries. Image fetches allow only HTTPS `lookaside.fbsbx.com`, no redirects,
and a 5 MB limit; provider checksums and the application's file signature/type rules
must pass before private storage. Other hosts/media types fail closed.

Sending is an explicit owner action after the exact message is approved/published,
the binding is approved and the external-send checkbox is selected. The application
requires a received customer message with a provider timestamp within 24 hours.
Templates and messages outside that conservative window are not implemented.
Text is capped at 4,096 characters; photo captions at 1,024.

A durable attempt claim is retained before provider mutation. An ambiguous outcome
is recorded as unknown and cannot be blindly retried. Submission is not delivery:
matched, signed receipts update sent/delivered/read/failed status without allowing
an older status to downgrade it. There is no autonomous sending schedule. Early
receipts arriving before a submission mapping, unknown outcomes, dropped callbacks
and reconciliation still require an operator procedure; there is no automated
reconciliation/reset endpoint. Do not duplicate a message to bypass an unknown state.

## API and implementation map

### Approved customer answer to task-scoped field update

When an office operator converts a current customer-message or photo finding to
an RFI, they may explicitly opt to share the eventual approved answer with the
field and select one or more active job tasks. The selected task IDs are checked
against that job. This does not expose the customer quote, attachment, analysis
suggestion or uncertainty to the worker. An answer stays out of field packs while
the RFI is open or its exact answer approval is pending/rejected.

After an answer is approved, the field pack projects only its title, approved
response, task titles and answer time, and only to a worker whose current task
scope intersects the selected tasks. The customer-link and analysis source are
rechecked; a revoked link or changed conversation/analysis removes the update
from the projection. Because this content participates in the work-pack source
hash, a changed pack invalidates its old read acknowledgement and any dependent
current start release. The approval record names the exact receiving tasks so
the approver reviews the distribution as part of the exact-answer decision. The
field card is informational: it does not change the
task, scope, dates or safety controls, and does not itself authorize work. This
route does not send a customer message; separately approved customer-draft and
publication controls remain in force.

The same approval flow adds a durable inbox alert for each currently assigned
worker whose task scope intersects the selected tasks. The alert contains only
the project and affected task names plus a direction to reopen the pack; it does
not reproduce the customer text, answer, photo or AI findings. On every inbox
read, the worker assignment, selected task intersection and current customer
source are revalidated. A changed or revoked source turns an old alert into a
generic freshness warning. External push and messaging are not implied.

| Interface | Purpose |
| --- | --- |
| `GET /api/client-portal/conversation?before=&limit=` | Portal-token scoped paged timeline; default 30, maximum 50 messages. |
| `POST /api/client-portal/conversation/messages` | JSON or multipart text/photo intake with `entryKey`, `body`, optional `replyTo`, `evidenceFile`. |
| `GET /api/client-portal/conversation/messages/:id/photo` | Authorized, integrity-checked photo bytes with no-store headers. |
| `/api/ledger/jobs/:jobId/conversations/:accessId` | Office counterpart, including private drafts; owner/approver/office operator only. |
| `POST .../messages/:id/publish` | Owner/approver release using the exact `sourceHash`, after approval. |
| `GET/POST .../analysis` | Configuration/current-result inspection or explicit local analysis. |
| `POST .../analysis/findings/:sourceId/rfi` | Office-reviewed conversion of a current inbound question/request/issue finding into an internal source-linked RFI; requires an exact retry key, responsible person and future due date. |
| `POST .../analysis/findings/:sourceId/variation` | Office-reviewed conversion of a current customer request into a formal change-order draft; requires an accepted contract baseline, explicit office-entered scope/price/schedule/risk and an exact retry key. |
| `POST .../analysis/findings/:sourceId/client-selection` | Prepare a private customer-choice draft from a current inbound request; office supplies the question, distinct options, deadline and rationale. A current-source approval publishes only the choice to the scoped portal. |
| `GET .../whatsapp` | Channel configuration state, binding and attempts/receipts. |
| `POST .../whatsapp/binding` | Owner registers a recipient binding requiring approval. |
| `POST .../whatsapp/revoke` | Owner revokes the current recipient binding. |
| `POST .../messages/:id/whatsapp` | Owner explicitly attempts a gated external send. |
| `/api/integrations/whatsapp/webhook` | Publicly reachable provider callback, independently verified. |
| `GET /api/ledger/jobs/:jobId/work-pack/drawings/:drawingId/content?sourceHash=...` | Assigned-worker, current-approved PDF bytes; exact source hash mandatory, private no-store response. Office previews must also supply an assigned worker ID. |

See `client-conversation.js`, `conversation-routes.js`, `conversation-analysis.js`,
`whatsapp-channel.js`, `offline-work-packs.mjs` and the React conversation/offline
components. These reuse communications, private documents, approvals and audit
events in the ledger; no schema migration is added. Back up ledger and evidence
together using existing verified backup controls. Offline device vaults are not
included in a server backup.

## Verification and remaining acceptance

Unit/API tests cover scoped visibility, exact retries, tampering, revoked access,
private photos, approval release, invalid analysis sources, disabled-provider
responses, encrypted-vault recovery and scoped synchronization. Provider fixtures
exercise signatures, account binding, duplicate intake, media-host restrictions,
unknown-send protection and monotonic delivery receipts. They are not live Meta
or model tests. Browser tests exercise customer photo persistence, office drafts
and offline reopen/queue/reconnect with isolated fixture databases, not user data.
See [worklog](CODEX_WORKLOG.md) for the exact completed verification run.

Before operational activation, verify an actual phone over authenticated HTTPS,
device storage/expiry/recovery, representative Dutch model quality and contradictory
sources, and the chosen model's real vision behavior. For WhatsApp, verify account,
webhook signatures, approved recipient identity, actual send/delivery/reply and the
unknown-outcome operator process. Hosted PostgreSQL/storage/provider acceptance
remains separate from local SQLite and fixture tests.

Formal customer-request variations retain the exact message quote, message hash,
analysis identity, proposal and uncertainty in the checksummed variation snapshot.
The change-order approval preview carries this source context into the reviewer
dialog and explicitly distinguishes the customer's request from verified scope,
price, feasibility or acceptance. Approval still only authorizes preparation of
an issue package; sending, verified customer acceptance, contract-value change
and work authorization remain separate controls.
The frozen issue package binds the full conversation origin into its internal
source-basis hash and includes only the escaped original customer quote in the
client-facing HTML. Portal/message identifiers, source and analysis hashes, the
AI suggestion and uncertainty remain internal; portal JSON does not expose the
internal conversation-origin object.
When an internally verified client response requests changes or rejects a
proposal, the next formal revision derives its source from that approved
response and the exact prior numbered package. The office revision form shows
the client's note, the new approval preview retains its approval and package
references, and the next client package includes the escaped note while keeping
those internal IDs/hashes and any prior AI analysis out of portal JSON and
client-facing HTML.

A current AI finding categorized as a customer request can also seed a separate
client-choice draft. The office operator must write the customer question and
at least two distinct options, set a future reply deadline, and record an
internal rationale. The internal approval view shows those exact values beside
the source quote, AI suggestion and uncertainty. Until approval, the choice is
not visible in the client portal. Approval rechecks the exact conversation and
analysis source and then publishes the choice only; rejection or a stale source
keeps it hidden. Publication does not send a message, record an answer, imply
agreement, change scope or price, or authorize work. Any customer response is
handled by the existing separately reviewed client-selection response flow.
The conversation API integration test follows one AI-derived proposal through
publication, token-scoped customer response, and separate office approval. It
also checks that internal rationale, analysis identity, and source hashes do
not appear in either portal response. The existing client-portal browser flow
covers the customer submission, pending-review state, office approval and
recorded result in the rendered portal.

An approved request or rejection now also creates a source-linked action in the
office daily workbench. It opens the job for a person to prepare and review the
next formal variation; autonomous draft creation is disabled for this action.
The ledger only accepts the latest revision as its source. If internal approval
rejects a proposed revision, that rejected revision becomes the next office
follow-up, the original approved client response remains attached, and a later
approved revision closes the earlier chain without erasing the rejection or
changing any client commitment. No client message, price, scope, or date is
changed automatically.

Equipment reservations can now optionally point to one active job task. If the
registered tool becomes unavailable, fails its inspection gate, or awaits a
retirement decision, the contractor's recovery view links that resource state
to the reserved work window and task. Closing its recovery case requires current
equipment readiness or release of the reservation and an explicit source
reassessment. This does not authorize substitute equipment, spend, rescheduling
or customer communication.

The selected logged-in Meta business portfolio was inspected on 5 September 2026.
It had no WhatsApp Business account. The creation wizard was opened but not
submitted: provider terms, CAPTCHA, phone verification, sender/recipient purpose,
credentials and live delivery are still operator gates. No account was created,
number migrated or message sent. Personal profile/phone details are intentionally
not stored in repository fixtures or documentation.

Primary references consulted:
[Ollama structured outputs and vision](https://docs.ollama.com/capabilities/structured-outputs),
[Meta Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api),
[Meta messages collection](https://www.postman.com/meta/whatsapp-business-platform/folder/o48mro7/messages),
and the historical [Meta webhook signature documentation](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/).
The latter SDK is archived and is not a dependency. Operator review of current
provider terms, supported Graph version and account settings is still required.

Office can also select a photograph from the current, fully approved and
released photo-evidence set for that same job and prepare a customer-facing
message around it. This reuses the retained private evidence document, binds
the draft to the exact set, capture, approval and checksum, and rechecks those
sources both when the communication is approved and when it is published. The
message and image remain absent from the portal until separate communication
approval and explicit publication. Customer responses remain in the same
conversation; no WhatsApp or email send is implied. Client projections omit
internal evidence provenance, while media reads remain scoped to the active
portal token and verify the stored content hash.

### Private Photo Resource Policy

Conversation images are loaded near the viewport as authorized static WebP
previews, not automatic full-camera-file downloads. `GET .../photo?preview=1`
returns a no-store preview capped at 960 pixels per edge and 512 KiB; the existing
`GET .../photo` still returns the unchanged retained original. Each path verifies
current ownership, access and the original checksum. Original download is an
explicit, localized icon action, including when a legacy image cannot generate
a preview. Downloading a preview or original is not client delivery or approval.

New JPEG/PNG/WebP uploads require successful actual decoding, matching MIME,
at most 64 million pixels and 16384 pixels per edge, in addition to the existing
filename, signature and upload-byte restrictions. Preview generation strips
metadata, applies orientation and renders only the first frame of animated
inputs; it never rewrites the retained evidence or its checksum. The original
can still contain its original metadata and must be handled as private evidence.

One native conversion runs at a time, with at most four admitted unique jobs,
32 MiB retained encoded input and an 8 MiB/64-entry/five-minute preview cache.
Identical requests share one conversion, but cache reuse never substitutes for
route authorization or current-source verification. Browser body reads are
limited to two at a time, explicit downloads have queue priority, and only
`503 image_processing_busy` preview responses have bounded automatic retries.
All mounted conversation viewers share at most eight active preview leases per
browser document, including pending reads. With IntersectionObserver available,
leaving the 256-pixel viewport margin aborts the preview read, removes the image
and revokes its object URL while preserving the fixed frame. Reentry makes a new
authorized read; client memory is not a reusable private-image cache. Explicit
original downloads are not cancelled merely because their preview leaves view.

A waiting frame has a localized photo icon that can prioritize that image without
raising the ceiling. If the observer API is absent or cannot be constructed, the
same eight-lease ceiling and manual selection still work, but geometric offscreen
release cannot be claimed. This is a bound on admitted app previews, not total
browser RAM, browser/OS caches, explicitly opened image tabs, downloads, offline
vaults or other product surfaces. Real phone-memory acceptance remains separate.
