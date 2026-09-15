"""Camada fina sobre o Backblaze B2 via S3-compatible API (boto3) — não usa
o SDK nativo da B2 de propósito, pra não adicionar mais uma dependência só
pra put_object/head_object, que o boto3 já resolve.

Layout no bucket:
    auvo-tasks/raw/{ano}/{ano}-{mes:02d}.ndjson.gz

Um objeto = um mês = snapshot completo daquele mês no momento da busca
(payload bruto da Auvo, sem normalização — decisão deliberada: é a camada
"raw" do data lake, qualquer transformação/curadoria vem depois, quando
houver uma necessidade concreta de consulta)."""

from __future__ import annotations

import gzip
import io
import json
import os
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError
from botocore.config import Config as BotoConfig


def _env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Variável de ambiente obrigatória ausente: {name}")
    return value


def build_client():
    region = _env("B2_REGION")
    return boto3.client(
        "s3",
        endpoint_url=f"https://s3.{region}.backblazeb2.com",
        aws_access_key_id=_env("B2_APPLICATION_KEY_ID"),
        aws_secret_access_key=_env("B2_APPLICATION_KEY"),
        # path-style + SigV4 explícitos: generate_presigned_url só funcionou
        # com os dois — confirmado ao vivo (15/09/2026). Sem isso o boto3
        # assina com SigV2 (AWSAccessKeyId=...&Signature=...&Expires=...) e o
        # B2 rejeita com "bucket is not authorized", mesmo com
        # put_object/get_object autenticado direto funcionando normalmente
        # (esses não passam pelo mesmo caminho de assinatura de URL).
        config=BotoConfig(
            retries={"max_attempts": 5, "mode": "standard"},
            s3={"addressing_style": "path"},
            signature_version="s3v4",
        ),
    )


def month_key(year: int, month: int) -> str:
    return f"auvo-tasks/raw/{year:04d}/{year:04d}-{month:02d}.ndjson.gz"


def object_exists(s3, bucket: str, key: str) -> bool:
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in ("404", "NoSuchKey", "NotFound"):
            return False
        raise


def upload_month(s3, bucket: str, year: int, month: int, tasks: list[dict]) -> str:
    key = month_key(year, month)
    fetched_at = datetime.now(timezone.utc).isoformat()

    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="wb") as gz:
        for task in tasks:
            envelope = {"_fetched_at": fetched_at, "_source": "auvo", "task": task}
            gz.write((json.dumps(envelope, ensure_ascii=False) + "\n").encode("utf-8"))

    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=buffer.getvalue(),
        ContentType="application/x-ndjson",
        ContentEncoding="gzip",
        Metadata={"task-count": str(len(tasks)), "fetched-at": fetched_at},
    )
    return key
