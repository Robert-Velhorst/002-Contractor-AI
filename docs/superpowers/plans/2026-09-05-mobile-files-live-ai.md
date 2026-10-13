# Mobile Files and Local Activation Implementation Plan

**Goal:** Download real approved drawing bytes for disconnected workers, provide
a native Android field client, and verify a real local model without sending
customer data to an AI cloud. Prepare the explicitly selected Meta account for
live verification without migrating a personal phone or fabricating approvals.

**Architecture:** Extend the existing assignment-scoped work-pack contract with
checksum-bound drawing retrieval. Encrypt downloaded files with the web vault.
The native Android client uses the same bearer-authenticated routes and Android
Keystore/private storage, not a second ledger. Ollama runs loopback-only with
cloud disabled, bounded model memory and retained isolated evaluation evidence.

**Scope approval:** Robert explicitly requested these remaining components and
routine execution without repeated design approvals. Existing dirty work stays.
No commits, push, store publication, account migration or billable subscription.

## Deliverables

- [x] Drawing files: add unit/API tests for active assignment, approved/current
  revision, exact document/hash and revocation; add bounded encrypted downloads,
  offline PDF opening/export, bounded downloads, error handling and browser reload tests.
- [x] Local AI evaluation: install a verified portable Ollama release in ignored local tools;
  disable cloud, install a small model appropriate to current free memory; add
  configurable limits, a live evaluation script and operational startup guidance.
  Run real Dutch source/negation tests with isolated records, no real client data.
  Actual calls used synthetic adapter sources, not ledger inserts. Three model
  candidates failed interpretation acceptance; application activation stays blocked.
- [ ] Android: add a native Java client with HTTPS configuration, named-worker
  login, work-pack list/download, encrypted offline state, drawing preview and
  replay-safe questions/acknowledgments. Build and test with Android tools where
  available; report SDK/device/signing gates without claiming unperformed tests.
  Source and build helper added. Build preflight confirms Android SDK is absent;
  SDK terms, compilation, device tests and release signing remain unfinished.
- [ ] Meta: inspect only the selected account through an authenticated browser;
  distinguish the personal Facebook profile from a provisioned WhatsApp Business
  account. Require actual account IDs/credentials and clarified sender/recipient
  before activation. Do not retain the user's profile/phone in tracked fixtures.
  Inspection completed: no WhatsApp account exists in the selected business
  portfolio. Creation wizard handed to Robert for terms/CAPTCHA; no submission.
- [x] Verify focused contracts, lint, frontend/browser behavior, packaging and
  local readiness; update operator docs with real outcomes and remaining gates.
  Full Node 568 pass / 36 environment skips / zero failures; frontend 26 pass;
  three selected browser scenarios pass; lint, contracts, bundle and Windows
  package/smoke pass. Local database checkpoint and unchanged audit head verified.

## Acceptance Boundaries

Offline downloaded bytes cannot observe remote revocation; display age/revision,
encrypt at rest and reauthorize all writes. Do not treat a PDF as safety clearance.
Do not send production conversations to model smoke tests. A lightweight model
passing fixtures is not proof of broad professional accuracy. iOS compilation,
signing and physical-device testing require an Apple build environment and are
not represented by an Android APK. SDK terms and provider configuration must not
be falsely recorded as accepted or verified.
