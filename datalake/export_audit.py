#!/usr/bin/env python3
"""Exportação pra auditoria: baixa os NDJSON.gz do B2, classifica cada
tarefa pelo tipo REAL da Auvo (sem bucket "outros" — cada tipo vira sua
própria categoria; só cai em "Sem tipo" quando a Auvo não mandou nome
nenhum), monta um índice compacto por O.S. (id, data, tipo, cliente,
técnico, status, link) e sobe tudo num único arquivo no B2. No final,
imprime uma URL assinada (válida por 15 min) pra baixar esse arquivo sem
precisar de credencial — é assim que o resultado sai do Actions sem
estourar limite de log nem exigir Python local.

Uso:
    python export_audit.py --months 2026-07,2026-08,2026-09
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import sys
from collections import defaultdict

from b2_storage import build_client, month_key
from months import parse_month

EXPORT_KEY = "auvo-tasks/exports/audit.json.gz"


class Lookup:
    """Deduplica strings repetidas (tipo/cliente/técnico) num índice —
    65 mil tarefas repetem os mesmos ~10 tipos e ~algumas dezenas de
    clientes/técnicos, então isso corta o tamanho do export várias vezes."""

    def __init__(self):
        self._index: dict[str, int] = {}
        self.values: list[str] = []

    def idx(self, value: str) -> int:
        if value not in self._index:
            self._index[value] = len(self.values)
            self.values.append(value)
        return self._index[value]


def classify(task_type_description: str | None) -> str:
    name = (task_type_description or "").strip()
    return name if name else "Sem tipo"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--months", required=True, help="Lista separada por vírgula, ex.: 2026-07,2026-08,2026-09")
    args = parser.parse_args()

    s3 = build_client()
    bucket = _required_env("B2_BUCKET_NAME")

    types = Lookup()
    customers = Lookup()
    technicians = Lookup()
    tasks: list[list] = []
    by_day_by_type: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    type_totals: dict[str, int] = defaultdict(int)
    sample_urls: list[str] = []

    for month_str in args.months.split(","):
        year, month = parse_month(month_str.strip())
        key = month_key(year, month)
        print(f"[baixando] {key}", file=sys.stderr)
        obj = s3.get_object(Bucket=bucket, Key=key)
        raw = gzip.decompress(obj["Body"].read())

        for line in raw.splitlines():
            if not line.strip():
                continue
            envelope = json.loads(line)
            task = envelope.get("task") or {}
            task_date = (task.get("taskDate") or "")[:10]
            if not task_date:
                continue

            type_name = classify(task.get("taskTypeDescription"))
            customer_name = (task.get("customerDescription") or "").strip() or "Sem cliente"
            technician_name = (task.get("userToName") or "").strip() or "Sem técnico"
            task_url = task.get("taskUrl") or ""
            if task_url and len(sample_urls) < 3:
                sample_urls.append(task_url)

            tasks.append([
                task.get("taskID"),
                task_date,
                types.idx(type_name),
                customers.idx(customer_name),
                technicians.idx(technician_name),
                task.get("taskStatus"),
                1 if task.get("finished") else 0,
                task_url,
            ])
            by_day_by_type[task_date][type_name] += 1
            type_totals[type_name] += 1

    print(f"[amostra de taskUrl] {sample_urls}", file=sys.stderr)
    print(f"[tipos reais encontrados] {dict(sorted(type_totals.items(), key=lambda kv: -kv[1]))}", file=sys.stderr)

    export = {
        "generatedAt": _now_iso(),
        "totalTasks": len(tasks),
        "types": types.values,
        "customers": customers.values,
        "technicians": technicians.values,
        "typeTotals": dict(type_totals),
        "byDayByType": {day: dict(cats) for day, cats in sorted(by_day_by_type.items())},
        "tasks": tasks,
    }

    payload = json.dumps(export, ensure_ascii=False).encode("utf-8")
    compressed = io.BytesIO()
    with gzip.GzipFile(fileobj=compressed, mode="wb") as gz:
        gz.write(payload)
    body = compressed.getvalue()

    s3.put_object(Bucket=bucket, Key=EXPORT_KEY, Body=body, ContentType="application/json", ContentEncoding="gzip")
    print(f"[upload] {len(payload)/1_048_576:.2f} MB descomprimido, {len(body)/1_048_576:.2f} MB gzip -> s3://{bucket}/{EXPORT_KEY}", file=sys.stderr)

    url = s3.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": EXPORT_KEY}, ExpiresIn=900)
    print("PRESIGNED_URL:" + url)
    return 0


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def _required_env(name: str) -> str:
    import os

    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Variável de ambiente obrigatória ausente: {name}")
    return value


if __name__ == "__main__":
    raise SystemExit(main())
