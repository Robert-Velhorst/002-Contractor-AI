# Contractor.AI

One contractor company coordinates work with people and customers. The same
person can participate in several companies without sharing their work dossiers.

## Language

**Person**:
A human participant whose identity remains separate from company access, work
qualifications, employment and individual assignments.
_Avoid_: Worker account as a synonym for the person

**Company Environment**:
A contractor company's authoritative administration and private work dossiers.
_Avoid_: Public marketplace, shared project pool

**Environment Authority**:
The retained right of one company environment to accept operational changes.
A copy of its dossiers is not a second right to operate the company.
_Avoid_: Login permission, ownership of a backup

**Company Handover**:
A reviewed transfer of environment authority from a stopped local source to a
verified hosted destination. It does not itself admit people or send messages.
_Avoid_: Backup copy, project completion handover

**Membership**:
A person's explicitly accepted and reviewed access relationship with one company.
_Avoid_: Identity, employment contract, safety clearance

**Invitation**:
A time-limited offer to request a specific company membership, not an access grant.
_Avoid_: Admission, automatic approval

**Admission**:
A retained company decision to activate a requested membership after checking the
person and proposed access. It does not verify trade qualifications or safe start.
_Avoid_: Registration, certification

**Worker Record**:
A company's operational record of an executing person, including assignments and
work requirements. Linking it to a membership requires an explicit company review.
_Avoid_: Shared identity

**Standby Window**:
A worker's time-bounded signal that they may consider work but have not committed
to a specific position. An overlapping application needs company review before
placement; existing assignments and hard unavailability remain authoritative.
_Avoid_: Guaranteed capacity, confirmed assignment, reason for family or health needs

**Standby Call-out**:
A time-limited offer to one eligible worker for a specific assignment that conflicts
with another worker's recorded unavailability. The recipient must explicitly accept;
the company must still submit the governed replacement for independent approval.
_Avoid_: Broadcast request, assignment, external notification, work-start permission

**Position**:
A reviewed opening for a defined contribution to a job, with location, period,
duration, terms and requirements. Interest, placement and start permission differ.
_Avoid_: Job, automatic dispatch

**Work Place**:
A retained physical site, building, floor, space, zone or installed asset where
work happens. It can recur across jobs within the same company environment.
_Avoid_: Company environment, person location tracking, portable equipment

**Job Party**:
A person or organization involved in a particular job in an explicit role, such
as property owner, resident, payer, decision maker or site contact. That role
alone grants neither account access nor authority to approve a commitment.
_Avoid_: Automatically authorized customer, company membership

**Work Package**:
A defined part of a job with an intended result, physical location and links to
the existing tasks and measured scope. It is not itself a start permit, commercial
agreement, acceptance record or payment status.
_Avoid_: Duplicate task list, offline download

**Field Work Pack**:
A worker-scoped, versioned set of instructions and work information retained for
execution, including offline use. Reading it is not safety clearance.
_Avoid_: Work package, independent company authority

**Task-Scoped Safety Plan**:
A reviewed work method assigned to a frozen crew and explicitly linked to the
tasks it covers. Its JHA, work permit, crew acknowledgement and on-site check
must remain current before work release; carrying a document for another task
does not cover this task.
_Avoid_: A job-wide safety file, an automatic permission to start

**Field Blocker Report**:
A source-bound report by an assigned worker that execution is blocked, including
the reported progress and explanation. It is an operational signal for office
review, not a safety release, a job closure, or permission to change a commitment.
_Avoid_: Resolved incident, completed task, customer-visible statement

**Equipment Outage**:
A current equipment reservation whose canonical tool is unavailable, fails its
inspection gate, or is awaiting retirement review. The reservation can be linked
to one active job task; it is a recovery signal, not proof of a particular
failure cause or authority to substitute equipment.
_Avoid_: Automatic replacement, supplier order, maintenance diagnosis, safety release

**Operational Recovery Case**:
An office-owned follow-up linking one or more retained disruptions to an owner,
due time, recovery action and evidence-backed resolution. Closing the case retains
its sources and evidence; it does not itself change assignments, orders,
customer commitments or safety status.
_Avoid_: Automatic replanning, external instruction, incident erasure

**Confirmed Client Appointment**:
A client-facing site visit assigned to a named worker, within its scheduled time,
whose specific appointment approval is retained as approved. It is evidence of
that appointment only, not a completion date or whole-project promise.
_Avoid_: Internal schedule entry, an unapproved proposed time, a completion commitment

**Client Impact Review**:
An office user's assessment of how one current disruption affects a confirmed
client appointment, linked to a retained incoming message from that appointment's
approved client conversation. The message and appointment source versions are
checked when saved and the message hash is retained with the review. It does not
contact the client or alter the appointment.
_Avoid_: Customer notice, rescheduling, an accepted new date, a free-text citation as message proof

**Contractual Client Date Commitment**:
An office-recorded date milestone tied to a currently accepted quote or formally
accepted change order, its verified acceptance approval, exact contract wording
and a document/page reference. Revisions and withdrawals remain in the audit
history. It does not follow from an internal target date, schedule calculation,
AI analysis or client-chat message, and recording it does not change the plan.
_Avoid_: Forecast date, appointment, chat-derived promise, legal verification claim

**Work Delivery**:
A specifically described portion of a work package, backed by retained production
measurements or completed task reports. Inspection, customer response and linked
financial settlement remain separate from that reported physical output.
_Avoid_: Whole-job completion, customer acceptance, payment

**Verified Delivery Response**:
A reviewed record of a named customer's acceptance, reservations or dispute about
one retained work delivery. It is not an inspection certificate, safety release,
permission to change the contract or proof that money has been received.
_Avoid_: Automatic acceptance, a party role as proof of authority

**Installed Asset**:
An identifiable installed component or system at a work place. Replacing it
creates a different asset; service history does not turn portable tools into
installed assets or certify that an installation is safe to use.
_Avoid_: Equipment inventory, a model number as a unique physical unit

**Asset Service Event**:
A source-linked report of work on one installed asset, or a retained earlier
record about it. Corrections preserve the original report. Execution evidence,
inspection, warranty coverage and a future maintenance commitment remain distinct.
_Avoid_: Safety clearance, proof of warranty entitlement

**Inspection Coverage Plan**:
A reviewed definition of the required checks for one specifically described
delivered portion of work. Its criteria and scope are distinct from the outcome
of any one inspection and from statutory or contractual completeness claims.
_Avoid_: Inspection template, inferred legal checklist

**Inspection Coverage Assessment**:
A reviewed mapping of every planned check to current inspection evidence or an
explicitly permitted, evidenced non-applicability decision. Coverage does not
itself authorize safe use, close a contract or establish customer acceptance.
_Avoid_: Commissioning release, automatic safety certification

**Client Delivery Offer**:
A reviewed invitation for a specific customer recipient to respond to a defined
delivered portion. Its content and validity are retained separately from the
customer's response, safe-use permission and whole-contract closure.
_Avoid_: Automatic acceptance, a general portal link as proof of authority

**Work Allocation Plan**:
A reviewed distribution of the planned production quantities over work packages.
It identifies which physical contribution belongs where without duplicating
measurements or creating a commercial change or a resource commitment.
_Avoid_: Worker placement, a second production baseline

**Work Balance**:
The current comparison of planned scope with recorded and attributed output,
including unassigned output, disputed corrections, excess and remaining work.
Unknown allocation is not zero progress; proportional labor estimates are not a
feasible calendar plan, acceptance, safe-start permission or financial settlement.
_Avoid_: Task completion percentage, confirmed remaining duration

**Shared Material Stock**:
A company-level, evidence-referenced physical stock count whose free quantity is
the counted balance minus active job allocations. It is separate from material
reported as already available at a specific job site; the two quantities must not
be silently combined.
_Avoid_: A supplier promise, an unverified receipt, stock reserved for a job

**Company Warehouse Receipt**:
A retained delivery record explicitly designated for a named company storage
location. Only accepted quantities linked to one shared material item with the
same unit increase shared stock. Reversing that movement requires its own approved
receipt reversal and a sufficient unreserved balance.
_Avoid_: A direct-to-site delivery, a supplier order, an automatic site-to-warehouse transfer

**Material Allocation**:
A retained reservation of a quantity from shared company stock for one linked
material requirement on one job. Release returns the unissued quantity to the
free balance; consumption or evidenced dispatch reduces physical stock against
a retained reference. It does not place an order, authorize spend, or change a
schedule or commitment.
_Avoid_: A procurement order, site receipt, automatic material substitution

**Company Stock Issue**:
An office-authorized, evidence-bound dispatch from a reserved company-stock
allocation to one job site. It records a unique dispatch reference and expected
arrival, reduces warehouse stock, and places an ETA on the job material
requirement. It is not proof that anything has physically arrived at the site.
_Avoid_: A supplier receipt, installed material, accepted site quantity

**Site Issue Receipt**:
A job-scoped field or office record confirming quantities physically received
against one company stock issue. Received, accepted, and damaged quantities are
separate; only accepted quantities increase material available at the job site.
Partial receipts retain their own receiver, location, evidence, and replay-safe
reference, and outstanding quantities remain in transit.
_Avoid_: Treating warehouse dispatch or an expected arrival as site availability

**Work-Plan Material Readiness**:
A task is blocked while its remaining material need is uncovered. An evidenced
expected-availability date can release the internal plan only when the full
remaining shortfall is expected to be available by that date. Linked warehouse
stock, free stock, active reservations, and quantities in transit are shown as
separate planning context; calculation never creates or changes an allocation.
_Avoid_: Treating a reservation as site stock, planning a partial delivery as full coverage
