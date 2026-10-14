# Hetzner Production Deployment

Hetzner is the target for production. This guide describes the release path; it
does not certify a provider, DPA, region, database, storage bucket, backup
policy, or live deployment. The current General-Server is a CPX12 in
Falkenstein. The deploy account can log in over SSH but has no Docker or sudo
privileges. `/opt/contractor-ai` was absent at the last read-only inspection, so
Contractor.AI is not installed there. Do not grant the deploy account the
`docker` group: Docker access is effectively root access.

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

The current VM is a small CPX12 (2 vCPU, 2 GB RAM, 40 GB local disk). It is an
existing target, not proof of production capacity. Measure memory and disk while
pulling and starting the image; do not build release images on this host. Keep
the database and evidence outside the VM. Set resource alerts before production
traffic and resize only after capacity review.

## Release and deployment

1. Merge a reviewed commit to `main`, wait for required CI, and publish a
   semantic-version GitHub Release from that exact `main` commit. The release
   workflow builds a multi-stage image and publishes it to GHCR with SBOM and
   provenance. Confirm the release workflow succeeded and record the immutable
   image digest. Do not deploy PR images or a floating `latest` tag.
2. Provision and verify the EU PostgreSQL, private S3 bucket, recovery policy,
   provider/DPA records, DNS ownership, ingress, firewall, monitoring and host
   update policy before putting company data on the server.
3. Create `/opt/contractor-ai` root-owned. Store `.env.hosted` with mode `0600`
   and the handover authority key separately with mode `0600`; neither belongs
   in Git, an image, shell history, or a deploy user's readable home. Fill all
   hosted values from `.env.hosted.example`; placeholders must be rejected.
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
   cd /opt/contractor-ai
   docker compose --env-file .env.hosted -f docker-compose.hosted.yml pull
   docker compose --env-file .env.hosted -f docker-compose.hosted.yml images contractor-ai
   ```

   Confirm the listed image corresponds to the recorded digest. The deploy
   wrapper must pass the same private environment file for Compose
   interpolation. Start with `up -d --no-build`; never build on the production
   VM. Verify container health, `/api/health/ready`, authenticated
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

The current server login recovery and non-root SSH login were verified, but no
application, environment file, database, object store, proxy route, Contractor.AI
TLS certificate, migration, or production backup is installed or verified.
Domain DNS still points elsewhere and a request to the current destination
timed out during inspection. The current server's capacity has not been load
tested. The existing `v1.1.0-rc.1` release points to commit
`62d0872cd7a44d123a4e4535936702f21cb8ec1b`, but its release workflow's container
job failed because attestations were requested from the default Docker driver.
The tag's GHCR manifest is present, but that failed run does not establish a
successful release package or verified provenance. The current workflow now
configures a dedicated Buildx container driver; publish and verify a fresh
release package before selecting an image for production. Therefore no
deployment or cutover is ready based on the current release alone.
