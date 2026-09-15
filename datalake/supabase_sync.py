"""Empurra tarefas já buscadas da Auvo pro Supabase, via
POST /operation/history/ingest — mesmo endpoint que a aba "Histórico" do
ConnectFast consulta depois. Não precisa da service_role key do Supabase
aqui: só a anon key (já pública, embutida no próprio frontend) mais um
token de ingestão dedicado (HISTORY_INGEST_TOKEN), que o endpoint confere
antes de gravar — ver supabase/functions/operation/handlers/historyIngest.ts.
"""

from __future__ import annotations

import os

import requests

BATCH_SIZE = 2000
REQUEST_TIMEOUT_S = 30


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Variável de ambiente obrigatória ausente: {name}")
    return value


def _to_ingest_row(task: dict) -> dict:
    return {
        "auvoTaskId": task.get("taskID"),
        "taskDate": (task.get("taskDate") or "")[:10],
        "taskTypeName": (task.get("taskTypeDescription") or "").strip() or "Sem tipo",
        "customerId": task.get("customerId"),
        "customerName": (task.get("customerDescription") or "").strip() or None,
        "technicianId": task.get("idUserTo"),
        "technicianName": (task.get("userToName") or "").strip() or None,
        "status": task.get("taskStatus"),
        "finished": bool(task.get("finished")),
        "taskUrl": task.get("taskUrl") or None,
    }


def push_tasks(raw_tasks: list[dict]) -> int:
    """Recebe tarefas BRUTAS da Auvo (mesmo payload que auvo_client.py já
    retorna), normaliza e envia em lotes de BATCH_SIZE. Retorna quantas
    linhas foram confirmadas (upsert) pelo servidor."""
    base_url = _required_env("SUPABASE_FUNCTIONS_URL").rstrip("/")
    anon_key = _required_env("SUPABASE_ANON_KEY")
    ingest_token = _required_env("HISTORY_INGEST_TOKEN")

    rows = [_to_ingest_row(t) for t in raw_tasks if t.get("taskID") and t.get("taskDate")]
    total_upserted = 0

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        resp = requests.post(
            f"{base_url}/history/ingest",
            json={"tasks": batch},
            headers={
                "Authorization": f"Bearer {anon_key}",
                "apikey": anon_key,
                "X-Ingest-Token": ingest_token,
                "Content-Type": "application/json",
            },
            timeout=REQUEST_TIMEOUT_S,
        )
        if not resp.ok:
            raise RuntimeError(f"Falha ao empurrar lote pro Supabase (HTTP {resp.status_code}): {resp.text[:300]}")
        total_upserted += resp.json().get("upserted", len(batch))

    return total_upserted
