# INSTALL

## Prerequisites

- Node.js 20+ recommended
- npm 10+
- Docker + Docker Compose (for containerized run)

## 1) Local Install

```bash
npm ci
```

## 2) Build Frontend

```bash
npm run build
```

This builds from `frontend/` and publishes `index.html` + `assets/` to project root.

## 3) Run Local Server

```bash
npm run start
```

Default URL: `http://localhost:8080`

Optional custom port:

```bash
PORT=8090 npm run start
```

## 4) Docker (App Only)

```bash
docker compose -f docker-compose.yml up -d --build
```

Stop:

```bash
docker compose -f docker-compose.yml down
```

## 5) Docker (Nginx + HTTPS Stack)

```bash
docker compose -f docker-compose.nginx.yml up -d --build
```

This stack runs:

- `hyperpulse-app` (Node server)
- `hyperpulse-nginx` (80/443)
- `hyperpulse-snapshot-worker` (rotation worker)
- `hyperpulse-certbot` (certificate helper)

Stop:

```bash
docker compose -f docker-compose.nginx.yml down
```

## 6) Snapshot Jobs

One-shot snapshot:

```bash
npm run snapshot
```

## 7) Recommended Validation (3+ Passes)

1. Diagnostics: run LSP diagnostics on changed files.
2. Build: `npm run build`
3. Runtime smoke:
   - Local: `npm run start` + `curl http://127.0.0.1:8080/`
   - Docker: `docker compose ... up` + endpoint checks

## Troubleshooting

- If `8080` is occupied, stop conflicting process/container or use another `PORT`.
- If stale UI appears, run `npm run build` again and hard refresh browser cache.
- If Docker stack conflicts, run `docker compose ... down --remove-orphans` before restart.
