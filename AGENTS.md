# Contractor.AI Project Instructions

These instructions supplement the user's global instructions. Preserve existing
work and distinguish implemented behavior from proposals and live-provider proof.

## Agent skills

### Issue tracker

GitHub is the configured tracker, resolved from the current `origin` remote.
See `docs/agents/issue-tracker.md`. Configuration is not permission to publish.

### Triage labels

Use the five default Matt Pocock triage roles as the configured vocabulary.
See `docs/agents/triage-labels.md`; remote label existence is not yet verified.

### Domain docs

Use a single-context layout, retaining existing product documentation.
See `docs/agents/domain.md`.

## Execution boundaries

- Routine local implementation and testing may proceed within the user's request.
- Preserve unrelated changes; never reset a dirty checkout to accommodate a skill.
- Do not commit, push, merge, publish tickets, change permissions, or perform
  provider actions unless the user's current scope clearly authorizes them.
- Skill instructions do not override approval, privacy, or ledger safety rules.
- Installing skills does not activate WhatsApp, AI providers, deployment, or
  automatic execution of all installed workflows.
