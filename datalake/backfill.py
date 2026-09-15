#!/usr/bin/env python3
"""Backfill histórico: busca cada mês da Auvo (só por período, sem filtro de
tipo/status/técnico — dump completo) e grava um NDJSON.gz por mês no
Backblaze B2. Idempotente: pula mês cujo objeto já existe no bucket, a
menos que --force seja passado — então rodar de novo depois de uma falha só
refaz os meses que faltaram.

Uso:
    python backfill.py --start-month 2026-01 --end-month 2026-09
    python backfill.py --force                       # start/end default: ver abaixo
"""

from __future__ import annotations

import argparse
import os
import sys

from auvo_client import AuvoClient
from b2_storage import build_client, month_key, object_exists, upload_month
from months import current_month, format_month, month_sequence, parse_month

DEFAULT_START_MONTH = "2026-01"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-month", default=DEFAULT_START_MONTH, help="YYYY-MM (default: %(default)s)")
    parser.add_argument("--end-month", default="", help="YYYY-MM (vazio = mês atual)")
    parser.add_argument("--force", action="store_true", help="Refaz mesmo que o mês já exista no B2")
    args = parser.parse_args()

    start = parse_month(args.start_month)
    end = parse_month(args.end_month) if args.end_month.strip() else current_month()
    months = month_sequence(start, end)

    print(f"Backfill {format_month(*start)} a {format_month(*end)} ({len(months)} mês(es)) — force={args.force}")

    auvo = AuvoClient(api_key=_required_env("AUVO_API_KEY"), api_token=_required_env("AUVO_API_TOKEN"))
    s3 = build_client()
    bucket = _required_env("B2_BUCKET_NAME")

    failures: list[str] = []
    for year, month in months:
        label = format_month(year, month)
        key = month_key(year, month)

        if not args.force and object_exists(s3, bucket, key):
            print(f"[skip]  {label} já existe em s3://{bucket}/{key}")
            continue

        print(f"[fetch] {label}...", flush=True)
        try:
            tasks = auvo.fetch_month(year, month)
            uploaded_key = upload_month(s3, bucket, year, month, tasks)
            print(f"[done]  {label}: {len(tasks)} tarefa(s) -> s3://{bucket}/{uploaded_key}")
        except Exception as exc:  # noqa: BLE001 — queremos seguir pros outros meses e reportar no final
            print(f"[erro]  {label}: {exc}", file=sys.stderr)
            failures.append(label)

    if failures:
        print(f"\n{len(failures)} mês(es) falharam: {', '.join(failures)}. Rode de novo (sem --force) pra retomar.")
        return 1

    print("\nBackfill concluído sem falhas.")
    return 0


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Variável de ambiente obrigatória ausente: {name}")
    return value


if __name__ == "__main__":
    raise SystemExit(main())
