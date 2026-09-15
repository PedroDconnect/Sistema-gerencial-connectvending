#!/usr/bin/env python3
"""Sincronização diária: reprocessa e SOBRESCREVE os últimos N meses
(padrão 2: mês atual + anterior) no data lake, porque tarefa é mutável
(aberta -> finalizada, check-in/check-out chegam depois) — um mês já
"fechado" há muito tempo não muda mais e por isso não entra aqui; só os
meses recentes precisam ser reconferidos todo dia.

Uso:
    python sync_recent.py --months 2
"""

from __future__ import annotations

import argparse
import os
import sys

from auvo_client import AuvoClient, fetch_month_resilient
from b2_storage import build_client, upload_month
from months import add_months, current_month, format_month
from supabase_sync import push_tasks


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--months", type=int, default=2, help="Quantos meses recentes reconferir (default: %(default)s)")
    args = parser.parse_args()

    if args.months < 1:
        raise SystemExit("--months precisa ser >= 1")

    latest = current_month()
    targets = [add_months(*latest, -offset) for offset in range(args.months)]
    targets.sort()

    print(f"Sync diário: {', '.join(format_month(*t) for t in targets)}")

    auvo = AuvoClient(api_key=_required_env("AUVO_API_KEY"), api_token=_required_env("AUVO_API_TOKEN"))
    s3 = build_client()
    bucket = _required_env("B2_BUCKET_NAME")

    failures: list[str] = []
    for year, month in targets:
        label = format_month(year, month)
        print(f"[fetch] {label}...", flush=True)
        try:
            tasks = fetch_month_resilient(auvo, year, month)
            key = upload_month(s3, bucket, year, month, tasks)
            print(f"[done]  {label}: {len(tasks)} tarefa(s) -> s3://{bucket}/{key}")
        except Exception as exc:  # noqa: BLE001
            print(f"[erro]  {label}: {exc}", file=sys.stderr)
            failures.append(label)
            continue

        try:
            upserted = push_tasks(tasks)
            print(f"[supabase] {label}: {upserted} tarefa(s) upsertadas em auvo_tasks_history")
        except Exception as exc:  # noqa: BLE001 — B2 já está gravado; não desfaz por causa disso
            print(f"[erro]  {label}: gravou no B2 mas falhou ao empurrar pro Supabase: {exc}", file=sys.stderr)
            failures.append(label + " (supabase)")

    if failures:
        print(f"\n{len(failures)} mês(es) falharam: {', '.join(failures)}.")
        return 1

    print("\nSync concluído sem falhas.")
    return 0


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Variável de ambiente obrigatória ausente: {name}")
    return value


if __name__ == "__main__":
    raise SystemExit(main())
