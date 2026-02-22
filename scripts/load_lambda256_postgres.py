#!/usr/bin/env python3

import csv
import hashlib
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path


CSV_PATH = Path("/Users/steve/Clab_news/lambda256_server_info.csv")
COMPOSE_PATH = Path("/Users/steve/Clab_news/docker-compose.db.yml")


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def normalize_section_name(raw: str) -> str:
    name = re.sub(r"^\*+\s*", "", raw or "")
    name = re.sub(r"\s*\*+$", "", name)
    return name.strip()


def to_number(value: str):
    text = (value or "").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def sql_lit(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value).replace("'", "''")
    return f"'{text}'"


def build_sql(rows):
    sha256 = hashlib.sha256(CSV_PATH.read_bytes()).hexdigest()
    imported_at = datetime.now(timezone.utc).isoformat()

    statements = [
        "BEGIN;",
        "TRUNCATE TABLE server_metrics, server_inventory, section_totals, section_column_labels, chain_sections, import_batches RESTART IDENTITY CASCADE;",
        (
            "INSERT INTO import_batches(id, source_path, source_sha256, imported_at, row_count) "
            f"VALUES (1, {sql_lit(str(CSV_PATH))}, {sql_lit(sha256)}, {sql_lit(imported_at)}, {len(rows)});"
        ),
    ]

    section_id = 0
    label_id = 0
    server_id = 0
    metric_id = 0
    total_id = 0
    current_section_id = None
    current_column_labels = {}

    for row_number, row in enumerate(rows, start=1):
        padded = row + [""] * (35 - len(row))
        col0 = padded[0].strip()

        if col0.startswith("***") and col0.endswith("***"):
            section_id += 1
            current_section_id = section_id
            current_column_labels = {}
            section_name = normalize_section_name(col0)
            section_slug = slugify(section_name)
            statements.append(
                (
                    "INSERT INTO chain_sections(id, batch_id, row_number, section_name, section_slug) VALUES ("
                    f"{section_id}, 1, {row_number}, {sql_lit(section_name)}, {sql_lit(section_slug)});"
                )
            )
            for idx in range(11, 32):
                label = padded[idx].strip()
                if not label:
                    continue
                label_id += 1
                current_column_labels[idx] = label
                statements.append(
                    (
                        "INSERT INTO section_column_labels(id, section_id, column_index, label) VALUES ("
                        f"{label_id}, {section_id}, {idx}, {sql_lit(label)});"
                    )
                )
            continue

        if not current_section_id:
            continue

        has_totals = any(padded[idx].strip() for idx in (32, 33, 34))

        if col0:
            server_id += 1
            raw_json = json.dumps(
                {f"c{idx:02d}": padded[idx].strip() for idx in range(35)},
                ensure_ascii=False,
            )
            statements.append(
                (
                    "INSERT INTO server_inventory("
                    "id, batch_id, section_id, row_number, server_id, network, deployment_status, environment_type, "
                    "private_ip, host_name, public_ip, total_cpu_vcore, total_memory_gb, total_storage_tb, raw_row_json"
                    ") VALUES ("
                    f"{server_id}, 1, {current_section_id}, {row_number}, {sql_lit(padded[0].strip())}, "
                    f"{sql_lit(padded[1].strip() or None)}, {sql_lit(padded[2].strip() or None)}, {sql_lit(padded[3].strip() or None)}, "
                    f"{sql_lit(padded[4].strip() or None)}, {sql_lit(padded[5].strip() or None)}, {sql_lit(padded[6].strip() or None)}, "
                    f"{sql_lit(to_number(padded[32]))}, {sql_lit(to_number(padded[33]))}, {sql_lit(to_number(padded[34]))}, "
                    f"{sql_lit(raw_json)}::jsonb);"
                )
            )

            for idx in range(7, 32):
                value_text = padded[idx].strip()
                if not value_text:
                    continue
                metric_id += 1
                statements.append(
                    (
                        "INSERT INTO server_metrics("
                        "id, server_record_id, section_id, column_index, column_label, value_text, value_numeric"
                        ") VALUES ("
                        f"{metric_id}, {server_id}, {current_section_id}, {idx}, {sql_lit(current_column_labels.get(idx))}, "
                        f"{sql_lit(value_text)}, {sql_lit(to_number(value_text))});"
                    )
                )
            continue

        if has_totals:
            total_id += 1
            statements.append(
                (
                    "INSERT INTO section_totals(id, batch_id, section_id, row_number, total_cpu_vcore, total_memory_gb, total_storage_tb) VALUES ("
                    f"{total_id}, 1, {current_section_id}, {row_number}, {sql_lit(to_number(padded[32]))}, {sql_lit(to_number(padded[33]))}, {sql_lit(to_number(padded[34]))});"
                )
            )

    statements.extend(
        [
            "SELECT setval('import_batches_id_seq', (SELECT COALESCE(MAX(id), 1) FROM import_batches));",
            "SELECT setval('chain_sections_id_seq', (SELECT COALESCE(MAX(id), 1) FROM chain_sections));",
            "SELECT setval('section_column_labels_id_seq', (SELECT COALESCE(MAX(id), 1) FROM section_column_labels));",
            "SELECT setval('server_inventory_id_seq', (SELECT COALESCE(MAX(id), 1) FROM server_inventory));",
            "SELECT setval('server_metrics_id_seq', (SELECT COALESCE(MAX(id), 1) FROM server_metrics));",
            "SELECT setval('section_totals_id_seq', (SELECT COALESCE(MAX(id), 1) FROM section_totals));",
            "COMMIT;",
        ]
    )
    return "\n".join(statements)


def main():
    if not CSV_PATH.exists():
        raise SystemExit(f"CSV not found: {CSV_PATH}")
    if not COMPOSE_PATH.exists():
        raise SystemExit(f"Compose file not found: {COMPOSE_PATH}")

    rows = list(csv.reader(CSV_PATH.read_text(encoding="utf-8-sig").splitlines()))
    sql_text = build_sql(rows)

    postgres_user = os.getenv("POSTGRES_USER", "hyperpulse")
    postgres_db = os.getenv("POSTGRES_DB", "hyperpulse_ops")

    command = [
        "docker",
        "compose",
        "-f",
        str(COMPOSE_PATH),
        "exec",
        "-T",
        "db",
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        postgres_user,
        "-d",
        postgres_db,
    ]

    subprocess.run(command, input=sql_text.encode("utf-8"), check=True)
    print("Loaded lambda256 CSV into PostgreSQL")


if __name__ == "__main__":
    main()
