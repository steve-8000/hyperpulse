# Lambda256 PostgreSQL Ops

This project now runs a Dockerized PostgreSQL database for server inventory and future snapshot automation.

## Start DB

```bash
npm run db:pg:up
```

## Load CSV into PostgreSQL

```bash
npm run db:pg:load
```

The loader parses `lambda256_server_info.csv` and writes normalized data into:

- `import_batches`
- `chain_sections`
- `section_column_labels`
- `server_inventory`
- `server_metrics`
- `section_totals`

## Open SQL shell

```bash
npm run db:pg:psql
```

## Stop DB

```bash
npm run db:pg:down
```

## Future kubectl integration (important)

The schema already includes `snapshot_clone_jobs` for Kubernetes-triggered operations.

## Chain Update + ArgoCD integration

The schema now includes:

- `chain_alias_map` (protocol <-> network mapping, optional ArgoCD app/namespace)
- `argocd_image_status` (latest ArgoCD sync/health/live image snapshot)

Recommended setup:

1. Insert mapping rows into `chain_alias_map` with `protocol`, `network_slug`, and `argocd_application`.
2. Start backend (`npm run start`).
3. Trigger refresh endpoint from UI button or API:

```bash
curl -X POST http://localhost:8080/api/chain-update-targets/refresh-argocd
```

4. Read merged target table data:

```bash
curl http://localhost:8080/api/chain-update-targets
```

Recommended flow when backend is added:

1. Backend receives clone request from UI.
2. Backend inserts a `snapshot_clone_jobs` row with `status='queued'` and request payload.
3. Backend executes `kubectl` (or submits a Job/CronJob) and stores `k8s_namespace`, `k8s_job_name`.
4. Backend updates `status` to `running`, then `success`/`failed` with `result_payload` and `error_message`.
5. UI reads job history/progress from `snapshot_clone_jobs`.

This keeps your current inventory DB and future Kubernetes execution audit in one relational store.
