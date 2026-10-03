# Recover Registry Relationships Without Reviving Credentials

A registry recovery backup retains people, company bindings, memberships,
invitation history and audit evidence, but excludes passwords, recovery secrets,
sessions and OIDC credentials. Recovery requires a new empty database and fresh
registry, company-client and signing keys. Every recovered person requires a new
verified account-recovery ceremony; every company reviews its own admission again.

This costs more operator work than restoring a full authentication database, but
a backup cannot know which passwords, recovery codes or memberships were revoked
after its snapshot. Reusing them could silently restore access that was withdrawn.
Old records remain historical evidence, not current authentication authority.

Assisted person recovery is a separate registry-operator action, not a company
owner or public API shortcut. It requires an exact person/login binding and
retained identity-check/private-delivery references. The platform records that
asserted human review; it does not claim to verify the person's identity itself.
Its short-lived code is single-use and does not change company memberships.
