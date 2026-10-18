# Hetzner Production Deployment

Hetzner is the intended EU production target. This guide describes the release
path; it does not certify a provider, DPA, region, database, storage bucket,
backup policy, or live deployment. An authenticated, read-only console
inspection on 2026-10-16 confirmed the installed operating system and Docker
Compose are available, and existing production workloads already share the VM.
Contractor.AI was not installed. Perform a private capacity and ingress review
before provisioning. Keep hostnames, addresses and other services' inventory
in private operator records. Do not reset or reinstall the host, or grant a
deployment identity the `docker` group: Docker access is effectively root
access.

## Required architecture

- Hetzner VM in the approved EU region, with host firewall allowing SSH only
  from trusted administration networks and HTTPS ingress on 443 (plus 80 only
  for ACME HTTP validation/redirects).
- A supported, maintained host OS with security updates, time synchronization,
  monitoring and restricted SSH. Keep application traffic private to loopback.
- A managed PostgreSQL service in the EU with verified TLS (`sslmode=verify-full`),
  automated backups and point-in-time recovery.
- Private EU S3-compatible evidence storage with TLS, encryption, versioning,
  lifecycle/retention controls, scoped credentials and a signed DPA.
- An HTTPS reverse proxy with automated certificate renewal. The app container
  remains bound to `127.0.0.1`; the proxy must be the only ingress and its exact
  source address/CIDR must be configured as `CONTRACTOR_AI_TRUST_PROXY`.
- A root-owned deployment directory and a narrowly scoped root deployment
  command. Do not give a deploy identity unrestricted sudo or Docker access.
- Independent, encrypted backup retention and a tested database plus object
  version restore procedure.

The existing VM is shared and has limited spare capacity; this is not proof of
production capacity. Keep the database and evidence outside the VM. Measure
memory and disk while pulling and starting any image; do not build release
images on this host. Set resource alerts before production traffic and assess
capacity and co-residency before deployment.

## Release and deployment

1. Merge a reviewed commit to `main`, wait for required CI, and publish a
   semantic-version GitHub Release from that exact `main` commit. The release
   workflow builds a multi-stage image and publishes it to GHCR with SBOM and
   BuildKit provenance. It also creates GitHub artifact attestations for the
   Windows archive and container digest, then verifies each against the
   repository and expected release source ref before completing. Confirm the
   release workflow succeeded and record the immutable image digest. Do not
   treat BuildKit provenance alone as a GitHub artifact attestation, and do not
   deploy PR images or a floating `latest` tag.
2. Provision and verify the EU PostgreSQL, private S3 bucket, recovery policy,
   provider/DPA records, DNS ownership, ingress, firewall, monitoring and host
   update policy before putting company data on the server.
3. Create `/opt/contractor-ai` root-owned. Store `.env.hosted` with mode `0600`
   and the handover authority key separately with mode `0600`; neither belongs
   in Git, an image, shell history, or a deploy user's readable home. Fill all
   hosted values from `.env.hosted.example`; placeholders must be rejected.
   Install `deploy/contractor-ai-deploy` as root-owned
   `/usr/local/sbin/contractor-ai-deploy` (mode `0755`) and install the
   `deploy/contractor-ai-deploy.sudoers` policy with `visudo` validation. Keep
   the deploy account out of the `docker` group. The wrapper permits only
   `validate`, `pull`, `start`, `stop` and `status`; it uses fixed absolute
   paths, requires root-owned deployment files and never evaluates `.env.hosted`
   as shell code. Docker Compose runs with a clean root environment, so caller
   variables cannot override `.env.hosted`. Its `start` action pulls the pinned
   image and uses `up --detach --no-build`.
4. Authenticate the host to GHCR using a dedicated, read-only package credential
   held in a root-readable Docker credential store. Resolve the digest for the
   exact release tag, then pin that digest in `.env.hosted`:

   ```sh
   docker buildx imagetools inspect ghcr.io/robert-velhorst/002-contractor-ai:<release-tag>
   ```

   Record the top-level manifest-list digest as
   `ghcr.io/robert-velhorst/002-contractor-ai@sha256:<verified-digest>` in
   `CONTRACTOR_AI_IMAGE`. Pull and inspect the pinned image before activation:

   ```sh
   sudo /usr/local/sbin/contractor-ai-deploy validate
   sudo /usr/local/sbin/contractor-ai-deploy pull
   ```

   Before pulling, compare `CONTRACTOR_AI_IMAGE` with the immutable digest
   recorded from the exact release and verify that release's provenance. The
   wrapper passes the same private environment file for Compose interpolation;
   Docker pulls that digest rather than resolving a mutable tag. Start through
   the wrapper; never build on the production VM. Verify
   container health, `/api/health/ready`, authenticated
   `/api/readiness`, migration head, audit integrity, storage verification,
   release SHA, logs and proxy TLS before enabling external traffic.
5. Keep worker access, public registration, scheduler and external integrations
   disabled until their own security and operational acceptance is complete.
   The app's work-board modules do not imply that self-registration is ready for
   public launch.

The release workflow currently publishes a package only for a published
release. Hosted Compose supports a release image through `CONTRACTOR_AI_IMAGE`
while retaining `build: .` for local container tests and controlled staging.
Production commands must explicitly pull and use `--no-build`.

## Data migration and activation

Do not migrate by copying SQLite files or evidence directories. Follow
[Company Handover](docs/COMPANY_HANDOVER.md) and [EU Hosting](docs/EU_HOSTING.md):
freeze the source, create and verify a signed v3 backup, validate the handover
permit and target authority key, import into a new empty PostgreSQL database,
upload and read back each evidence object, and verify the receipt. Keep the new
service stopped until the receipt is verified. Bootstrap fresh hosted owner
credentials only after migration, then confirm `/api/readiness` and audit
integrity. Retain the encrypted source package until provider recovery and a
restore exercise have been proven.

DNS/TLS cutover is an explicit operator step after end-to-end acceptance. Lower
DNS TTL in advance, validate the new HTTPS origin and cookie/CORS behavior, then
switch records. Do not remove the old service until data, secrets, backups,
security controls, monitoring and rollback have all been verified.

## Rollback and recovery

For an application-only regression, stop the new container and redeploy the
previous verified image digest using the same database and environment. Review
schema compatibility before rollback: a newer release may have applied additive
migrations that an older image cannot safely use. Never downgrade by deleting
migrations, restoring stale credentials, or copying database files over the
live service. For database or evidence corruption, follow provider PITR and
object-version recovery, verify integrity in an isolated environment, and
record the recovery decision before restoring service.

After recovery, verify readiness, audit-chain integrity, authenticated office
and field workflows, evidence retrieval, database migration head, backup
freshness, object versioning and proxy/TLS behavior. Preserve incident logs and
the prior image digest. A rollback is not complete until those checks pass.

## Current blockers

Contractor.AI's app and hosted environment are not installed. No DPA-verified
EU PostgreSQL or evidence bucket, production backup, or migration receipt is
configured or verified. Hetzner Object Storage has no default at-rest
encryption; the hosted adapter now requires SSE-C, but a provider bucket,
versioning policy, independent key backup, and live encrypted read/write test
are still absent. This is a shared host; do not reset or reinstall it. A
read-only console review confirmed that a maintained host OS and container
runtime are available. Current capacity, co-residency, and service health must
be reviewed privately before adding load. Contractor.AI is not installed. Keep
exact host identifiers, addresses, resource measurements, service inventory,
and proxy configuration in private operator records, not this public
repository.

On 2026-10-18, the Hetzner DNS A record for
`002contractor-ai.noodzakelijkonline.de` resolved. HTTP returned `308` to
HTTPS, while an independent Node TLS client received
`ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR`. The public IP is intentionally omitted.
The subdomain has no verified proxy route, certificate, or Contractor.AI
backend. No live configuration was changed. Do not cut over until TLS, private
capacity, service health, and end-to-end readiness have been verified.

The current release-readiness PR is #129 at
`14198ae53a4e10714bce6eaec11ca05e424d7b26`. Its exact-head `verify`,
`windows-standalone`, and CodeQL checks passed on 2026-10-18. The PR remains
open as a draft. These checks validate the repository and build artifacts,
not the live host, provider configuration, or production acceptance.

GitHub `main` is `65f12eb5221f7e76ce26c7bc75a6a1264f36f09d`. Its `verify` run
and six dependency-coverage runs completed successfully on 2026-10-17. These
are CI results, not production acceptance. The only published release remains
the `v1.1.0-rc.1` pre-release, whose tag points to
`62d0872cd7a44d123a4e4535936702f21cb8ec1b`. A workflow-dispatch retry from
`9dbb4ae9bb06d3dd1ccea9b074fbc80192947cb1` completed both package jobs and
published a Windows archive plus a GHCR image index at
`sha256:a8a1cae1000662b5c629892ec32f6844a2a51009dba39d978f704b0045add621`.
The image contains an OCI BuildKit SLSA provenance manifest, but GitHub's
attestation verification endpoint returned 404; the run also tagged the image
with the dispatch commit's `sha-*` alias although the release tag points to an
older commit. Do not treat that pre-release image as a verified production
artifact. Current `main` now binds the `sha-*` alias to the validated release
source, but no package has been rebuilt from the current workflow and no stable
release from current `main` exists. No deployment or cutover is ready.
