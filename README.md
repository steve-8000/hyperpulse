# Hyperpulse

Hyperpulse is an operations-focused web application for blockchain infrastructure teams.
It provides a React-based operations dashboard, protocol catalog visibility, and a Node API for on-demand review generation.

## Architecture

- Frontend: Vite + React (`frontend/`), published to root static assets via `scripts/publish-frontend.mjs`.
- Backend: Node HTTP server (`server.mjs`) serving static files and `/api/client-review`.
- Data sources:
  - `list.md` as protocol source catalog (CSV block).
  - `data/snapshot.json` for latest version/update metadata.
  - `data/review-db.json` for review history state.
  - `reports/` for generated review markdown artifacts.
- Operations scripts:
  - `scripts/build-hourly-snapshot.mjs` for snapshot generation.
  - `scripts/run-rotation-worker.mjs` for periodic snapshot rotation.
  - `scripts/validate-rematch.mjs` and backfill/rebuild helpers.
- Deployment:
  - `docker-compose.yml` for simple app runtime.
  - `docker-compose.nginx.yml` for nginx + app + certbot + snapshot-worker stack.

## Repository Layout

- `frontend/`: React source.
- `server.mjs`: API and static server runtime.
- `scripts/`: snapshot/report/rebuild/deploy scripts.
- `deploy/`: nginx and certbot assets.
- `data/`: runtime state and generated metadata.
- `reports/`: review output artifacts.
- `assets/`: published frontend bundle served in production.

## NPM Scripts

- `npm run dev`: run Vite dev server.
- `npm run build`: build frontend and publish assets to root.
- `npm run preview`: preview Vite build.
- `npm run start`: run Node server on `PORT` (default `8080`).
- `npm run snapshot`: run snapshot generation once.

## Verification Policy

Before shipping changes, run at least three passes:

1. Static/diagnostics pass (LSP diagnostics on changed files).
2. Build pass (`npm run build`).
3. Runtime smoke pass (`npm run start` or Docker stack + endpoint checks).

## Refactor Status

Recent cleanup and optimization work completed:

- Removed unused legacy frontend files and duplicate review source copies.
- Removed OS metadata artifacts (`.DS_Store`) from runtime paths.
- Hardened static file path resolution in `server.mjs`.
- Consolidated production docs (`README.md`, `INSTALL.md`).

## Planned Development

- Backend integration for real K8s/Grafana/ArgoCD/PureStorage data sources.
- Role-based action guardrails (approval/audit controls for change workflows).
- Stronger module boundaries in frontend (`pages`, `components`, `hooks`) and server service split.
- E2E test coverage for key flows (dashboard -> detail -> action paths).
