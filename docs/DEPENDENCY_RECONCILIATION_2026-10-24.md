# Runtime and dependency reconciliation — 24 October 2026

This draft incorporates the existing Node security/runtime-contract changes
from PR #144, at `65ab24f86cfdf462ecbc83ce5295f076d1683c38`, into the jsdom 30
and accessibility branch. The source head of #144 is unchanged. Existing
accessibility fixes and unrelated offline-draft preservation remain present.
This is preparation in the review branch; no default-branch merge is claimed.

The supported Node ranges, Docker/workflow pins and Windows runtime verification
now use the patched versions from that runtime draft. The dependency refresh
selects patched body-parser 2.4.0, Zod 4.6.7 and current stable direct releases
within their declared ranges. The OIDC provider moves to 9.13.0.

## Babel parser 8

The direct parser dependency moves to stable 8.0.8. Babel 8 is ESM and requires
Node ^22.18.0 or >=24.11.0; the patched application runtime ranges satisfy this.
Node's synchronous require of ESM is intended to retain the source-inventory
module's synchronous API; hosted inventory checks must verify this boundary.
No parser implementation is loaded into a provider
or browser session by this preparation.

The source-inventory visitor uses StringLiteral, CallExpression for require,
NewExpression for workers and literal VariableDeclarator/ArrayExpression
inventories. It does not depend on the removed parser plugins, old dynamic
import node representation, TypeScript node shapes or serialized bigint AST
values. Existing runtime-source inventory and packaging checks remain required
under Babel 8; no inventory assertions are disabled or relaxed.

Sources: [Babel 8 migration](https://babeljs.io/docs/v8-migration),
[Babel 8 API changes](https://babeljs.io/docs/v8-migration-api/).

## Evidence boundaries

Public registry metadata was queried for all 38 direct dependencies with zero
query errors. Lockfile resolution disables lifecycle scripts. Local application
tests, provider logins, real databases and deployment are not exercised by this
preparation. Current-head hosted CI must qualify the combined changes; earlier
green checks on either independent draft do not qualify this new head.

Nested dependencies constrained by their parents, SDK/native library versions,
actual installed Windows runtime, browser behavior and deployment need separate
evidence. A clean npm audit does not prove all software is current or secure.
