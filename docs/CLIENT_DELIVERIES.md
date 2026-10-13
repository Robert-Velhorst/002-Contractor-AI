# Client Partial-Delivery Responses

## Purpose

The office can offer one retained, explicitly described executed portion to one
approved client portal. The client can respond with acceptance, reservations or
a dispute, a name, an authority declaration and an optional photograph. This is
connected to the existing partial-delivery record and client conversation.

It is not an electronic-signature service or proof of identity. Possession of a
portal link and a typed name do not establish authority to accept work. An owner
or approver must review the retained response and record how authority and the
source were checked. Physical progress, inspection coverage, customer response,
safe-use permission, financial settlement and whole-contract closure remain
different states. No message, payment, order or schedule commitment is dispatched.

## Office Workflow

1. Retain the completed portion under **Deelopleveringen**. Measured quantities
   and completed task reports stay linked to their original sources.
2. Create and approve client portal access for the intended recipient. A customer,
   payer, occupant and authorised decision maker need not be the same person.
3. Under **Opleveren aan klant**, choose the portion and exact portal access.
   Enter a client-facing title/scope, intended recipient, private authority basis,
   expiry and review reason. Confirm the limited scope. Only photos already
   visible in this exact conversation are selectable; older messages are pageable.
4. Submit publication to the existing approval queue. Its preview includes the
   exact public scope, quantities, inspection-coverage status, photo names,
   recipient and private authority reference. Pending publications are invisible
   to the client. Approval makes the offer available in the scoped portal; it
   does not send email or WhatsApp.
5. Review an incoming response in **Goedkeuringen**, including the respondent,
   outcome, reservations and original offer. Record an explicit review reason.
   Approval updates the existing delivery's verified customer-response state.
   Photos are visible in the office offer history and the same client conversation.
6. Withdraw an obsolete offer with a reason. History and already reviewed
   responses remain. Reject/cancel any pending response review before preparing a
   replacement offer. A replacement receives a new immutable version.

Only owners/office operators prepare or withdraw offers. Approvers can read
history and resolve approvals; field workers cannot access this private register.
There is at most one pending/approved offer per delivery and one response per
offer. Expired approved offers must also be withdrawn before replacement.

## Client Workflow

The existing hash-token portal contains **Aangeboden werk**, in Dutch or English.
It presents only approved or withdrawn offers for that specific access link.
Responding requires an explicit outcome, name, authority declaration and note.
An optional JPEG/PNG/WebP photo uses the existing private conversation upload
path, maximum 5 MB, with server-side validation. It becomes a conversation photo;
if the following response cannot be recorded, that acknowledged photo remains in
the conversation rather than being deleted or secretly submitted again.

The response is an inbound conversation message with immutable source provenance,
so the existing source-bound conversation analysis can consider it. This does not
activate an AI provider, infer visual conclusions or trigger external messaging.
The chat refreshes after an acknowledged response. Client-visible review status
distinguishes pending, recorded, rejected and cancelled review.

Unsent form fields and uncertain response attempts recover for up to 12 hours in
the same browser tab, scoped to a fingerprint of the exact client link, offer and
source version. The raw access token, photo bytes and file objects are never
written to browser storage. An uncertain response retries the same command body
and idempotency key. An acknowledged photo is reused without a second upload. If
photo receipt is uncertain, the client must reselect the original file; its
SHA-256 digest must match before the same upload key and caption can be retried.
Changing the portal link or offer source does not carry a draft into the new
scope. Recovery is not cross-device, cross-tab or encrypted offline storage;
expired or revoked access and changed server sources still block submission.
Office conflict drafts remain mounted and require explicit confirmation of
refreshed sources.

## Source and Privacy Rules

- Access must be approved, active, unexpired, job-bound and consistent with the
  current client and privacy processing restrictions.
- Offers bind executed scope, delivery revision, inspection state, coverage,
  selected photo provenance and access identity/expiry. Changed or withdrawn
  sources stop new responses and approval of pending responses.
- A client response remains unverified until its existing work-delivery approval
  is resolved with a review reason. The offer must still be available at that
  point. Link expiry/revocation after completed review does not retroactively
  erase or downgrade the historical accepted response.
- Quarantined or altered response-photo proof makes the linked delivery's
  current-evidence status stale. The original customer statement remains retained.
- Generated acceptance-evidence records and private authority/review notes are
  office-only. Client payloads omit internal document, decision, approval and
  delivery identifiers. Field packs retain existing operational projections.
- Conversation photos are served through authenticated scoped endpoints, never
  directly from storage. Access revocation prevents new downloads, but cannot
  erase a copy already downloaded by a recipient.
- Exact command retries return retained receipts; changed input under the same
  key fails. Response creation, its chat message, private evidence and approval
  are one database transaction. Source locks serialize competing replicas.

## API and Persistence

| Interface | Contract |
| --- | --- |
| `GET /api/ledger/jobs/:jobId/client-deliveries` | Office history, eligible portions/accesses, source hash. |
| `POST /api/ledger/jobs/:jobId/client-deliveries` | `action: offer` or `withdraw`, `record`, stable `entryKey`, `sourceHash`. |
| `GET /api/client-portal/deliveries` | Approved/withdrawn offers for authenticated portal access only. |
| `POST /api/client-portal/deliveries/:offerId/responses` | Stable `entryKey`, offer `sourceHash`, `outcome`, `respondent`, `authorityConfirmed: true`, `note`, `photoIds`. |
| Existing conversation messages/photo routes | Upload, retained message provenance and scoped photo reads. |
| Existing approval resolution | Offer publication or verified response, with current-source checks. |
| `GET /api/operations/export` | Owner export includes `clientDeliveries` with retained tables. |

Migration `081_client_delivery_responses` adds `client_delivery_offers`,
`client_delivery_responses` and `client_delivery_commands`. SQLite and PostgreSQL
use the same domain contract and company-authority guards. Backup validation
checks required tables/columns/indexes, retained hashes, approval content, source
bindings and original response-message provenance. Hosted import preserves
immutable snapshots/receipts; it does not turn old portal links into new authority.
Reviewed approval text and conversation provenance also remain byte-preserved
when evidence storage moves. A comment that happens to equal an old filename is
not a live storage pointer; only actual document storage references are rebound.

## Remaining Scope

Contractual closure, electronic signatures/strong recipient identity, whole-job
acceptance, safe-use/commissioning release, client-published installation history,
expiry extensions without replacement and offline submission of a partial-delivery
response remain separate work. Customer conversation supports an encrypted,
bounded offline message outbox; this does not enable offer or contract decisions
offline. The platform must not label this
partial workflow as any of those capabilities. Actual EU hosting, native-device
acceptance and provider activation require separate verification. Current local
test and package evidence is recorded in [the delivery register](TOTAL_SOLUTION_DELIVERY.md).
