# Keep Identity Separate From Company Ledgers

The identity registry owns people, credentials, company invitations and membership
decisions, but no customer, job, finance or evidence dossiers. Company runtimes
remain the only authorities for their own operating ledgers. This avoids merging
people by matching email addresses and lets one company revoke access without
disabling a person's other memberships.

OIDC handles authentication between the registry and company runtimes. Runtime
access is checked against the current membership, not an email claim or a stale
role embedded in a browser token. A registry outage blocks that authentication
path; independent local bootstrap access remains available for recovery. Offline
work packs remain scoped retained copies and do not become an identity authority.
