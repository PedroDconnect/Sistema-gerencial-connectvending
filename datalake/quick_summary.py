#!/usr/bin/env python3
"""Resumo rápido do que já está no data lake — baixa os NDJSON.gz do B2,
agrega por dia e por categoria de tipo, e imprime um JSON compacto no
stdout (prefixado por SUMMARY_JSON:, pra dar pra extrair de um log do
Actions sem precisar de artifact/upload). Não é o pipeline de curadoria
definitivo pro dashboard — é só uma forma rápida de enxergar o que já foi
coletado.

Uso:
    python quick_summary.py --months 2026-07,2026-08,2026-09
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
from collections import defaultdict

from b2_storage import build_client, month_key
from months import parse_month

# Mesmo agrupamento técnico/operacional de ConnectFastPage.jsx — usa o
# taskTypeDescription BRUTO da Auvo (antes da normalização/trim do TS),
# então casa por prefixo em vez de igualdade exata.
CATEGORY_PREFIXES = {
    "Chamado Técnico corretivo": "corretivo",
    "Abastecimento - Chamado": "abastecimento_chamado",
    "Abastecimento Rotina": "abastecimento_rotina",
    "Chamado logística": "logistica",
    "Chamado VmPay": "vmpay_uppay",
    "Instalação de degustação": "degustacao",
    "Degustação": "degustacao",
    "Finalização de maquina": "finalizacao_maquina",
}


def classify(task_type_description: str | None) -> str:
    name = (task_type_description or "").strip()
    for prefix, key in CATEGORY_PREFIXES.items():
        if name.startswith(prefix):
            return key
    return "outros"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--months", required=True, help="Lista separada por vírgula, ex.: 2026-07,2026-08,2026-09")
    args = parser.parse_args()

    s3 = build_client()
    bucket = _required_env("B2_BUCKET_NAME")

    by_day: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    by_category_total: dict[str, int] = defaultdict(int)
    total_tasks = 0

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
            task_date = (task.get("taskDate") or "")[:10]  # "yyyy-MM-dd..."
            if not task_date:
                continue
            category = classify(task.get("taskTypeDescription"))
            by_day[task_date][category] += 1
            by_category_total[category] += 1
            total_tasks += 1

    summary = {
        "totalTasks": total_tasks,
        "byCategoryTotal": dict(by_category_total),
        "byDay": {day: dict(cats) for day, cats in sorted(by_day.items())},
    }
    print("SUMMARY_JSON:" + json.dumps(summary, ensure_ascii=False))
    print(f"\nTotal: {total_tasks} tarefas, {len(by_day)} dias, categorias: {dict(by_category_total)}", file=sys.stderr)
    return 0


def _required_env(name: str) -> str:
    import os

    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Variável de ambiente obrigatória ausente: {name}")
    return value


if __name__ == "__main__":
    raise SystemExit(main())
