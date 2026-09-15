#!/usr/bin/env python3
"""Carga inicial pro Supabase: lê os meses JÁ ARQUIVADOS no B2 (não bate na
Auvo de novo) e empurra pro /history/ingest. Uso único — dali em diante,
backfill.py e sync_recent.py já chamam push_tasks() sozinhos logo depois de
cada mês novo.

Uso:
    python push_existing_to_supabase.py --months 2026-07,2026-08,2026-09
"""

from __future__ import annotations

import argparse
import gzip
import json
import os

from b2_storage import build_client, month_key
from months import parse_month
from supabase_sync import push_tasks


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Variável de ambiente obrigatória ausente: {name}")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--months", required=True, help="Lista separada por vírgula, ex.: 2026-07,2026-08,2026-09")
    args = parser.parse_args()

    s3 = build_client()
    bucket = _required_env("B2_BUCKET_NAME")

    grand_total = 0
    for month_str in args.months.split(","):
        year, month = parse_month(month_str.strip())
        key = month_key(year, month)
        print(f"[baixando] {key}")
        obj = s3.get_object(Bucket=bucket, Key=key)
        raw = gzip.decompress(obj["Body"].read())

        tasks = []
        for line in raw.splitlines():
            if not line.strip():
                continue
            envelope = json.loads(line)
            tasks.append(envelope.get("task") or {})

        upserted = push_tasks(tasks)
        grand_total += upserted
        print(f"[ok] {year}-{month:02d}: {upserted} tarefa(s) upsertadas no Supabase")

    print(f"\nTotal: {grand_total} tarefas upsertadas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
