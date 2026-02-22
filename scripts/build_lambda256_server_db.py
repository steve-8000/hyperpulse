#!/usr/bin/env python3

import argparse
import csv
import hashlib
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def to_number(value: str):
    text = (value or "").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def normalize_section_name(raw: str) -> str:
    name = re.sub(r"^\*+\s*", "", raw or "")
    name = re.sub(r"\s*\*+$", "", name)
    return name.strip()


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS import_batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_path TEXT NOT NULL,
            source_sha256 TEXT NOT NULL,
            imported_at TEXT NOT NULL,
            row_count INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chain_sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
            row_number INTEGER NOT NULL,
            section_name TEXT NOT NULL,
            section_slug TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS section_column_labels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            section_id INTEGER NOT NULL REFERENCES chain_sections(id) ON DELETE CASCADE,
            column_index INTEGER NOT NULL,
            label TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS server_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
            section_id INTEGER NOT NULL REFERENCES chain_sections(id) ON DELETE CASCADE,
            row_number INTEGER NOT NULL,
            server_id TEXT NOT NULL,
            network TEXT,
            deployment_status TEXT,
            environment_type TEXT,
            private_ip TEXT,
            host_name TEXT,
            public_ip TEXT,
            total_cpu_vcore REAL,
            total_memory_gb REAL,
            total_storage_tb REAL,
            raw_row_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS server_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_record_id INTEGER NOT NULL REFERENCES server_inventory(id) ON DELETE CASCADE,
            section_id INTEGER NOT NULL REFERENCES chain_sections(id) ON DELETE CASCADE,
            column_index INTEGER NOT NULL,
            column_label TEXT,
            value_text TEXT,
            value_numeric REAL
        );

        CREATE TABLE IF NOT EXISTS section_totals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
            section_id INTEGER NOT NULL REFERENCES chain_sections(id) ON DELETE CASCADE,
            row_number INTEGER NOT NULL,
            total_cpu_vcore REAL,
            total_memory_gb REAL,
            total_storage_tb REAL
        );

        CREATE INDEX IF NOT EXISTS idx_sections_batch_slug ON chain_sections(batch_id, section_slug);
        CREATE INDEX IF NOT EXISTS idx_inventory_batch_network ON server_inventory(batch_id, network);
        CREATE INDEX IF NOT EXISTS idx_inventory_server_id ON server_inventory(server_id);
        CREATE INDEX IF NOT EXISTS idx_inventory_host_name ON server_inventory(host_name);
        CREATE INDEX IF NOT EXISTS idx_metrics_server_col ON server_metrics(server_record_id, column_index);

        CREATE VIEW IF NOT EXISTS v_server_inventory AS
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
        """
    )


def build_db(csv_path: Path, db_path: Path) -> None:
    content = csv_path.read_bytes()
    sha256 = hashlib.sha256(content).hexdigest()

    rows = list(csv.reader(content.decode("utf-8-sig").splitlines()))
    max_cols = max((len(row) for row in rows), default=0)
    if max_cols < 35:
        raise ValueError(f"Expected at least 35 columns, found {max_cols}")

    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    ensure_schema(conn)

    imported_at = datetime.now(timezone.utc).isoformat()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO import_batches(source_path, source_sha256, imported_at, row_count) VALUES (?, ?, ?, ?)",
        (str(csv_path), sha256, imported_at, len(rows)),
    )
    batch_id = cur.lastrowid

    current_section_id = None
    current_column_labels = {}

    for row_number, row in enumerate(rows, start=1):
        padded = row + [""] * (35 - len(row))
        col0 = padded[0].strip()

        if col0.startswith("***") and col0.endswith("***"):
            section_name = normalize_section_name(col0)
            section_slug = slugify(section_name)
            cur.execute(
                "INSERT INTO chain_sections(batch_id, row_number, section_name, section_slug) VALUES (?, ?, ?, ?)",
                (batch_id, row_number, section_name, section_slug),
            )
            current_section_id = cur.lastrowid
            current_column_labels = {}
            for idx in range(11, 32):
                label = padded[idx].strip()
                if not label:
                    continue
                current_column_labels[idx] = label
                cur.execute(
                    "INSERT INTO section_column_labels(section_id, column_index, label) VALUES (?, ?, ?)",
                    (current_section_id, idx, label),
                )
            continue

        if not current_section_id:
            continue

        has_totals = any(padded[idx].strip() for idx in (32, 33, 34))

        if col0:
            raw_json = json.dumps(
                {f"c{idx:02d}": padded[idx].strip() for idx in range(35)},
                ensure_ascii=False,
            )
            cur.execute(
                """
                INSERT INTO server_inventory(
                    batch_id, section_id, row_number, server_id, network, deployment_status, environment_type,
                    private_ip, host_name, public_ip, total_cpu_vcore, total_memory_gb, total_storage_tb, raw_row_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    batch_id,
                    current_section_id,
                    row_number,
                    padded[0].strip(),
                    padded[1].strip() or None,
                    padded[2].strip() or None,
                    padded[3].strip() or None,
                    padded[4].strip() or None,
                    padded[5].strip() or None,
                    padded[6].strip() or None,
                    to_number(padded[32]),
                    to_number(padded[33]),
                    to_number(padded[34]),
                    raw_json,
                ),
            )
            server_record_id = cur.lastrowid

            for idx in range(7, 32):
                value_text = padded[idx].strip()
                if not value_text:
                    continue
                cur.execute(
                    """
                    INSERT INTO server_metrics(server_record_id, section_id, column_index, column_label, value_text, value_numeric)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        server_record_id,
                        current_section_id,
                        idx,
                        current_column_labels.get(idx),
                        value_text,
                        to_number(value_text),
                    ),
                )
            continue

        if has_totals:
            cur.execute(
                """
                INSERT INTO section_totals(batch_id, section_id, row_number, total_cpu_vcore, total_memory_gb, total_storage_tb)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    batch_id,
                    current_section_id,
                    row_number,
                    to_number(padded[32]),
                    to_number(padded[33]),
                    to_number(padded[34]),
                ),
            )

    conn.commit()
    conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build normalized SQLite DB from lambda256_server_info.csv"
    )
    parser.add_argument(
        "--csv",
        default="/Users/steve/Clab_news/lambda256_server_info.csv",
        help="Path to source CSV",
    )
    parser.add_argument(
        "--db",
        default="/Users/steve/Clab_news/data/lambda256_server_info.db",
        help="Output SQLite DB path",
    )
    args = parser.parse_args()

    csv_path = Path(args.csv)
    db_path = Path(args.db)
    if not csv_path.exists():
        raise SystemExit(f"CSV file not found: {csv_path}")

    build_db(csv_path, db_path)
    print(f"Built DB: {db_path}")


if __name__ == "__main__":
    main()
