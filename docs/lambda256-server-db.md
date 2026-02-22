# Lambda256 Server Inventory DB

This document describes the normalized SQLite database built from `lambda256_server_info.csv`.

## Build

```bash
python3 scripts/build_lambda256_server_db.py
```

Output:

- `data/lambda256_server_info.db`

## Schema Overview

- `import_batches`
  - Import metadata (`source_path`, `sha256`, `imported_at`, `row_count`)
- `chain_sections`
  - Section groups parsed from rows like `*** Arbitrum Mainnet ***`
- `section_column_labels`
  - Per-section labels discovered in columns 11..31 (e.g. `Execution Layer`, `Chain SSDB`, `Exporter`)
- `server_inventory`
  - Core server records with normalized identity/network fields and total resources
  - Includes `raw_row_json` for exact source traceability
- `server_metrics`
  - Non-empty metrics from columns 7..31 for each server row
  - Stores both raw text and numeric value where parseable
- `section_totals`
  - Summary rows with total CPU/memory/storage for each section
- `v_server_inventory`
  - Join view for common reporting queries

## Integrity Characteristics

- Strong import lineage with SHA-256 per batch
- Original row preserved in `server_inventory.raw_row_json`
- Numeric coercion handled safely (invalid numeric text kept as text in metrics)
- Indexes for frequent filters (`section_slug`, `network`, `server_id`, `host_name`)

## Query Examples

Top sections by provisioned CPU:

```sql
SELECT cs.section_name, ROUND(SUM(si.total_cpu_vcore), 2) AS cpu_vcore
FROM server_inventory si
JOIN chain_sections cs ON cs.id = si.section_id
GROUP BY cs.section_name
ORDER BY cpu_vcore DESC;
```

Servers on a specific host:

```sql
SELECT server_id, network, host_name, total_cpu_vcore, total_memory_gb, total_storage_tb
FROM v_server_inventory
WHERE host_name = 'idc-chain-host-31';
```

Section totals captured from summary rows:

```sql
SELECT cs.section_name, st.total_cpu_vcore, st.total_memory_gb, st.total_storage_tb
FROM section_totals st
JOIN chain_sections cs ON cs.id = st.section_id
ORDER BY st.row_number;
```
