# Frontend Subpages + Modal Interaction Plan

## Scope
- Upgrade existing frontend-only operations UI with concrete subpages and interaction flows.
- Keep backend integration out-of-scope for now (mock/preview behavior only).
- Preserve existing `Chain Update Info` catalog and `#/protocol/:name` detail route.

## Route and Page Model
- Keep current hash route structure for top-level pages.
- Add in-page subnavigation per top-level page (tabs/segment buttons):
  - Server Status: `Node Overview`, `Workloads`, `Storage`
  - Alerts Log: `Live Feed`, `Correlation`, `Runbooks`
  - Alerts Reports: `Daily`, `Weekly`, `Monthly`
  - Chain Update: `Plan`, `Precheck`, `Rollout`, `Postcheck`
  - Chain Migration: `Checklist`, `Execution`, `Cutover`, `Recovery`
  - Chain Snapshot: `Policies`, `Jobs`, `Restore Drills`, `Integrity`
  - AI Incident Analysis: `RCA Queue`, `Evidence`, `Prevention`
  - AI Trend Reports: `Reliability`, `Capacity`, `Alert Quality`

## Widget and Action Design
- Add widget cards in each subpage with primary/secondary actions.
- Add action buttons that open modal dialogs:
  - confirm dialogs (approve, pause, rollback, rerun)
  - detail dialogs (incident timeline, precheck details, snapshot metadata)
- Use one shared modal component with content driven by selected action payload.

## State Strategy
- Use local React state in `App.jsx`:
  - `activeSubpageByPage` map
  - `activeModal` object (`open`, `title`, `body`, `actions`)
- Keep existing data loaders untouched for catalog (`list.md`, `snapshot.json`).
- Keep detail review fetch untouched.

## Styling Strategy
- Extend `app.css` with reusable classes:
  - subpage tab bar
  - widget grids and cards
  - modal overlay/dialog/actions
  - micro badges for status and priority
- Maintain current visual language and responsive behavior.

## Validation
- LSP diagnostics on `frontend/src/App.jsx` and `frontend/src/app.css`.
- Build with `npm run build`.
- Smoke check root page and built assets.

## Non-Goals
- No backend endpoint additions.
- No K8s/Grafana/ArgoCD/PureStorage runtime wiring.
- No auth model changes.
