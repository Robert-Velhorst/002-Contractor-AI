# Dashboard Overhaul Implementation Plan

**Goal:** Deliver the approved graphite/light, task-first redesign without changing ledger contracts or discarding existing work.

**Architecture:** Keep the existing React/Vite application and its role-filtered actions. Extract navigation and agenda into small presentation components. Add dossier section navigation that keeps form state mounted. Apply scoped design tokens across the operator dashboard; retain independent client/offline surfaces.

**Tech Stack:** React 19, Vite, lucide-react, existing Node ledger, Vitest and Playwright.

**Spec:** Robert approved the design in this conversation: grouped navigation, prioritized Today workspace, consistent project dossiers and controls, responsive layouts, unchanged data and permissions. The generated concept is a visual reference only; its invented company suffix, date, status and extra filters must not enter the product.

## Constraints
- Preserve all pre-existing uncommitted work. Work on `codex/dashboard-overhaul`; no commit, push, external messaging or provider activation.
- No fabricated metrics, projects, photos, company details or online status.
- Maintain every existing navigation destination and role boundary.
- Local-first: no remote fonts, image dependencies or new frontend framework.
- Use 44px mobile targets, visible keyboard focus, semantic controls, zero letter spacing and reduced-motion support.
- Keep form state when changing dossier sections; retain an all-sections view for existing workflows.

## Tasks
1. [x] Navigation: add component tests for grouping, current-page state, permission-filtered input and navigation callbacks; implement `components/DashboardNavigation.jsx` and wire it into `App.jsx`.
2. [x] Agenda: test chronological same-day scheduled work, invalid dates, empty state and callbacks; implement `components/TodayAgenda.jsx` beside the live workbench. Existing workbench and reviews remain authoritative.
3. [x] Dossier: test keyboard section navigation and draft retention; implement `components/DossierSections.jsx`, grouping existing controls without changing handlers or permissions.
4. [x] Design system: add `dashboard-design.css` for shell, shared controls, metrics, tables, forms, overlays and lazy-loaded workspaces. Retain all actual record content; repair mobile table clipping and sidebar overflow.
5. [x] Verify: run frontend tests, lint, build and bundle budget. Add/run focused real-ledger browser navigation and desktop/mobile checks, plus existing workbench, review, localization, field and client regressions as practical. Inspect rendered screenshots in the in-app browser. Keep QA data separate from the operator ledger.

## Verification Result (2026-09-06)
- 31 frontend tests and 36 targeted dashboard/static Node tests passed.
- Full lint plus final lint for changed tests passed; production build, release
  contract, and bundle budget passed (497,252 total gzip bytes).
- Initial browser selection: 5 passed (dashboard, workbench, dossier review).
  Final expanded selection: 13 passed (dashboard, parent localization, field work
  packs, connected experiences, auth sessions and accessibility). Together these
  cover 16 distinct workflows, not the full 109-workflow suite.
- Updated the browser-discovery count and two existing test selectors to match
  the new accurate open-job label and specific level-one Today heading.
- Inspected desktop, mobile and dossier screenshots and the local in-app browser.
  Its screenshot transport produced cropped/padded images; fixed-size Playwright
  screenshots and viewport assertions supplied the layout evidence.
- Tests used temporary ledgers. Operator data and pre-existing changes remained
  intact. Local preview: http://127.0.0.1:34123/ on `codex/dashboard-overhaul`.
- No commit/push or provider activation. Full backend, container and Windows
  package verification were not rerun; no independent reviewer tool was available.

## Component Contracts
Navigation: render only the provided `items` tuples `[key, translatedLabel, Icon]`; selecting one invokes `onSelect(key)`. Active item has `aria-current="page"`. Group headings disappear when their items are absent.

Agenda: `jobs`, `now`, `locale`, `onOpenJob(job)`, `onOpenSchedule()`; only valid scheduledStart values on the local calendar day are shown, sorted by start. No target-date inference or invented commitments.

Dossier: `DossierSections({locale, fieldScoped, children})` owns selection. `DossierSection({areas, children})` stays mounted and is hidden outside selected groups. Default is all sections. Tabs support arrows/Home/End and retain form inputs. Field role cannot see commercial tab.

## Verification Commands
Use bundled Node 22: `release/ContractorAI-windows-x64/runtime/node.exe`.

```powershell
.\release\ContractorAI-windows-x64\runtime\node.exe node_modules/vitest/vitest.mjs run
.\release\ContractorAI-windows-x64\runtime\node.exe node_modules/eslint/bin/eslint.js .
.\release\ContractorAI-windows-x64\runtime\node.exe node_modules/vite/bin/vite.js build
.\release\ContractorAI-windows-x64\runtime\node.exe scripts/verify-bundle-budget.js
.\release\ContractorAI-windows-x64\runtime\node.exe scripts/run-browser-tests.js e2e/dashboard-design.spec.js e2e/contractor-workbench.spec.js e2e/contractor-review.spec.js
```
