CREATE TABLE IF NOT EXISTS import_batches (
  id BIGSERIAL PRIMARY KEY,
  source_path TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL,
  row_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chain_sections (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  section_name TEXT NOT NULL,
  section_slug TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS section_column_labels (
  id BIGSERIAL PRIMARY KEY,
  section_id BIGINT NOT NULL REFERENCES chain_sections(id) ON DELETE CASCADE,
  column_index INTEGER NOT NULL,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS server_inventory (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES chain_sections(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  server_id TEXT NOT NULL,
  network TEXT,
  deployment_status TEXT,
  environment_type TEXT,
  private_ip TEXT,
  host_name TEXT,
  public_ip TEXT,
  total_cpu_vcore NUMERIC(18,6),
  total_memory_gb NUMERIC(18,6),
  total_storage_tb NUMERIC(18,6),
  raw_row_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS server_metrics (
  id BIGSERIAL PRIMARY KEY,
  server_record_id BIGINT NOT NULL REFERENCES server_inventory(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES chain_sections(id) ON DELETE CASCADE,
  column_index INTEGER NOT NULL,
  column_label TEXT,
  value_text TEXT,
  value_numeric NUMERIC(18,6)
);

CREATE TABLE IF NOT EXISTS section_totals (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES chain_sections(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  total_cpu_vcore NUMERIC(18,6),
  total_memory_gb NUMERIC(18,6),
  total_storage_tb NUMERIC(18,6)
);

CREATE TABLE IF NOT EXISTS snapshot_clone_jobs (
  id BIGSERIAL PRIMARY KEY,
  chain_protocol TEXT NOT NULL,
  chain_network TEXT,
  namespace TEXT NOT NULL,
  source_pvc TEXT NOT NULL,
  target_base_pvc TEXT NOT NULL,
  target_server TEXT NOT NULL,
  requested_by TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'queued',
  k8s_namespace TEXT,
  k8s_job_name TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS chain_alias_map (
  id BIGSERIAL PRIMARY KEY,
  protocol TEXT NOT NULL,
  network_slug TEXT NOT NULL,
  environment_type TEXT,
  argocd_application TEXT,
  argocd_namespace TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(protocol, network_slug)
);

CREATE TABLE IF NOT EXISTS argocd_image_status (
  id BIGSERIAL PRIMARY KEY,
  protocol TEXT NOT NULL,
  network_slug TEXT NOT NULL,
  argocd_application TEXT NOT NULL,
  argocd_namespace TEXT,
  sync_status TEXT,
  health_status TEXT,
  source_revision TEXT,
  expected_image TEXT,
  live_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_match BOOLEAN,
  error_message TEXT,
  raw_app_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(protocol, network_slug, argocd_application)
);

CREATE INDEX IF NOT EXISTS idx_sections_batch_slug ON chain_sections(batch_id, section_slug);
CREATE INDEX IF NOT EXISTS idx_inventory_batch_network ON server_inventory(batch_id, network);
CREATE INDEX IF NOT EXISTS idx_inventory_server_id ON server_inventory(server_id);
CREATE INDEX IF NOT EXISTS idx_inventory_host_name ON server_inventory(host_name);
CREATE INDEX IF NOT EXISTS idx_metrics_server_col ON server_metrics(server_record_id, column_index);
CREATE INDEX IF NOT EXISTS idx_clone_jobs_status ON snapshot_clone_jobs(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_chain_alias_protocol ON chain_alias_map(protocol);
CREATE INDEX IF NOT EXISTS idx_chain_alias_network ON chain_alias_map(network_slug);
CREATE INDEX IF NOT EXISTS idx_argocd_status_protocol_network ON argocd_image_status(protocol, network_slug);
CREATE INDEX IF NOT EXISTS idx_argocd_status_updated_at ON argocd_image_status(updated_at DESC);

CREATE OR REPLACE VIEW v_server_inventory AS
SELECT
  si.id AS server_record_id,
  cs.section_name,
  cs.section_slug,
  si.server_id,
  si.network,
  si.deployment_status,
  si.environment_type,
  si.private_ip,
  si.host_name,
  si.public_ip,
  si.total_cpu_vcore,
  si.total_memory_gb,
  si.total_storage_tb,
  si.row_number
FROM server_inventory si
JOIN chain_sections cs ON cs.id = si.section_id;
