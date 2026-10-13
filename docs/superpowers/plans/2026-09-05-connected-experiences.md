# Connected Experiences Implementation Plan

**Goal:** Deliver offline work packs, private photo conversations, source-grounded
analysis and a gated WhatsApp adapter on the existing local-first ledger.

**Spec:** `docs/THREE_PRODUCT_EXPERIENCES.md`; Robert approved implementation of
the remaining components. No routine approval questions, secrets creation, live
provider commitments, commits or pushes are implicit in this implementation.

**Architecture:** Reuse communications, documents, approvals and audit storage.
Keep portal recipients access-scoped; an explicit approval releases an immutable
outbound message. Offline work packs use an encrypted browser vault and a static
offline entry point, never a cache of authenticated API responses. AI runs against
an explicitly configured local Ollama endpoint; WhatsApp uses authenticated Meta
webhooks and fail-closed outbound dispatch with retained evidence.

**Stack:** Existing Node 22/Express/SQLite-Postgres adapter, React/Vite,
Web Crypto/IndexedDB/service worker, existing private evidence storage.

## Steps

- [x] Add tests and implement recipient-scoped durable conversations, source IDs,
  replay-safe text/photo intake, reply links, approval release and media checks.
- [x] Wire customer and office conversation screens, loading/error states,
  photo previews, replies and approval navigation. Test authenticated boundaries.
- [x] Add encrypted offline work-pack download/unlock, local response queue,
  reconnect/revision conflict handling, explicit erasure and static-shell caching.
- [x] Add local structured model analysis with validated source quotations,
  persisted reviewable outputs, limits and no implicit action execution.
- [x] Add signed WhatsApp intake, explicit recipient binding, provider receipts,
  bounded media ingestion and approval-gated, duplicate-safe dispatch behavior.
- [x] Run focused and regression tests, frontend lint/build/browser checks,
  package smoke and documentation of configured versus verified-live capabilities.

Verification detail is retained in `docs/CODEX_WORKLOG.md`. One full-run performance
threshold failed under concurrent load and passed separately; this is not a claim
of a wholly green full-suite run. Live model, Meta, hosted infrastructure, native
phone acceptance and offline drawing-file coverage remain outside this completed
implementation increment, not removed from the original product requirements.

## Acceptance Boundaries

Never persist tokens in the offline vault. Offline access cannot observe a remote
revocation; limit retained access, make age visible and reauthorize all writes.
Lost/unknown provider outcomes must not trigger blind resend. A chat message is
not a signature or variation acceptance. Model output is untrusted data and every
retained factual quotation must match its immutable source. No real messages or
external AI calls are made during isolated tests. Current provider documentation
is checked before adapters are implemented. No claim of complete production or
native-mobile acceptance follows from mocked provider tests.
