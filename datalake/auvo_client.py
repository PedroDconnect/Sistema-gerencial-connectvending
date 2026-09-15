"""Cliente Auvo para o data lake — porta fiel de
supabase/functions/operation/integrations/auvo/{auvo.auth,auvo.client}.ts
pros mesmos comportamentos empiricamente confirmados lá (formato do login,
paginação, timeouts, retry). Não reaproveita esse código TS porque o
backfill roda fora do Supabase (GitHub Actions, sem limite de tempo de
execução de Edge Function) — mas o contrato com a API da Auvo é o mesmo.

Diferença deliberada da política de retry do TS: lá, 404 na listagem NÃO é
retriável (uma consulta filtrada por status/tipo pode legitimamente não ter
nenhuma tarefa). Aqui, o backfill nunca filtra por status/tipo — só por
período — então um mês inteiro sem nenhuma tarefa é praticamente impossível;
um 404/500 nesse contexto é quase sempre o sintoma já documentado no TS
("várias chamadas simultâneas com o mesmo token fazem a Auvo devolver
404/500 de forma inconsistente"). Por isso 404 entra na lista de retry aqui.
"""

from __future__ import annotations

import json
import math
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

import requests

from months import current_month

AUVO_BASE_URL = "https://api.auvo.com.br/v2"
AUVO_MAX_PAGE_SIZE = 100  # teto da própria Auvo — confirmado: 150 -> HTTP 400
# O TS usa 25s (AUVO_REQUEST_TIMEOUT_MS) porque atende um request HTTP ao
# vivo com prazo curto. Este pipeline roda em lote sem essa pressão de
# tempo — confirmado ao vivo (teste real em 15/09/2026, run #34967188096)
# que uma página de 100 tarefas pode legitimamente passar de 25s pra ser
# gerada pela Auvo; usar o mesmo timeout aqui só desperdiçava as 3
# tentativas em ~80s sem nenhuma responder. 60s dá mais folga real.
REQUEST_TIMEOUT_S = 60
CONCURRENCY_LIMIT = 8  # AUVO_CONCURRENCY_LIMIT do TS — testado, 16 já derruba a Auvo
TOKEN_SAFETY_MARGIN = timedelta(minutes=2)
MAX_ATTEMPTS = 4
RETRYABLE_STATUSES = {404, 429, 500, 502, 503, 504}

BRAZIL_TZ = timezone(timedelta(hours=-3))  # fixo — Brasil não tem mais horário de verão desde 2019


class AuvoError(RuntimeError):
    pass


def _parse_auvo_expiration(value: str) -> datetime:
    # Auvo devolve "yyyy-MM-dd HH:mm:ss" sem timezone, confirmado ser
    # horário de Brasília (mesmo comentário de auvo.auth.ts).
    naive = datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    return naive.replace(tzinfo=BRAZIL_TZ).astimezone(timezone.utc)


def month_range(year: int, month: int) -> tuple[str, str]:
    """Início/fim do mês, formato naive 'yyyy-MM-ddTHH:mm:ss' (mesmo formato
    que o TS já manda pra Auvo, sem sufixo de timezone)."""
    import calendar

    start = datetime(year, month, 1, 0, 0, 0)
    last_day = calendar.monthrange(year, month)[1]
    end = datetime(year, month, last_day, 23, 59, 59)
    fmt = "%Y-%m-%dT%H:%M:%S"
    return start.strftime(fmt), end.strftime(fmt)


class AuvoClient:
    def __init__(self, api_key: str, api_token: str):
        self._api_key = api_key
        self._api_token = api_token
        self._token: str | None = None
        self._expires_at: datetime | None = None
        self._lock = threading.Lock()

    def _login(self) -> None:
        resp = requests.post(
            f"{AUVO_BASE_URL}/login",
            json={"apiKey": self._api_key, "apiToken": self._api_token},
            timeout=REQUEST_TIMEOUT_S,
        )
        if not resp.ok:
            raise AuvoError(f"Login na Auvo falhou (HTTP {resp.status_code}).")
        result = (resp.json() or {}).get("result") or {}
        if not result.get("authenticated") or not result.get("accessToken"):
            raise AuvoError("Auvo não autenticou com as credenciais configuradas (AUVO_API_KEY/AUVO_API_TOKEN).")
        self._token = result["accessToken"]
        self._expires_at = _parse_auvo_expiration(result["expiration"])

    def _ensure_token(self, force: bool = False) -> str:
        with self._lock:
            now = datetime.now(timezone.utc)
            stale = self._token is None or self._expires_at is None or now >= self._expires_at - TOKEN_SAFETY_MARGIN
            if force or stale:
                self._login()
            return self._token  # type: ignore[return-value]

    def list_tasks_page(
        self, param_filter: dict, page: int, page_size: int = AUVO_MAX_PAGE_SIZE
    ) -> tuple[list[dict], int]:
        query = {
            "paramFilter": json.dumps(param_filter),
            "page": page,
            "pageSize": min(page_size, AUVO_MAX_PAGE_SIZE),
            "order": "Asc",
        }

        last_error: Exception | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            token = self._ensure_token()
            try:
                resp = requests.get(
                    f"{AUVO_BASE_URL}/tasks/",
                    params=query,
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=REQUEST_TIMEOUT_S,
                )
            except requests.RequestException as exc:
                last_error = exc
                time.sleep(min(3 * attempt, 20.0))
                continue

            if resp.status_code == 401:
                self._ensure_token(force=True)
                last_error = AuvoError("401 da Auvo — token forçado a renovar.")
                continue

            if resp.status_code == 429:
                retry_after = resp.headers.get("Retry-After")
                wait = float(retry_after) if retry_after else min(0.8 * attempt, 5.0)
                last_error = AuvoError("429 (rate limit) da Auvo.")
                time.sleep(wait)
                continue

            if resp.status_code in RETRYABLE_STATUSES and attempt < MAX_ATTEMPTS:
                last_error = AuvoError(f"HTTP {resp.status_code} da Auvo (tentativa {attempt}/{MAX_ATTEMPTS}).")
                time.sleep(min(3 * attempt, 20.0))
                continue

            if not resp.ok:
                raise AuvoError(f"Falha ao listar tarefas (página {page}): HTTP {resp.status_code} — {resp.text[:300]}")

            payload = resp.json() or {}
            result = payload.get("result") or {}
            paged = result.get("pagedSearchReturnData") or {}
            entity_list = result.get("entityList") or []
            total_items = paged.get("totalItems", 0) or 0
            return entity_list, total_items

        raise AuvoError(f"Página {page} falhou após {MAX_ATTEMPTS} tentativas: {last_error}")

    def fetch_month(self, year: int, month: int) -> list[dict]:
        """Busca TODAS as tarefas do mês (sem filtro de tipo/status/técnico —
        é um dump completo), paginando com concorrência limitada.

        Validação de contagem final vs. totalItems (reportado na 1ª página)
        só é estrita pra mês FECHADO (qualquer mês anterior ao atual) — um
        mês fechado não deveria ganhar tarefa nova no meio da busca, então
        divergência ali é sinal real de página perdida. O mês EM ANDAMENTO é
        um alvo móvel de propósito (confirmado ao vivo, run #34967581403:
        ~22 mil tarefas de setembro/2026, buscar todas levou minutos o
        bastante pra novas tarefas serem criadas no meio do caminho) — pra
        esse caso a divergência é esperada, só logamos e seguimos com o que
        foi coletado (é um snapshot "como estava agora", o sync diário
        refaz esse mesmo mês de novo amanhã)."""
        start, end = month_range(year, month)
        param_filter = {"startDate": start, "endDate": end}
        is_closed_month = (year, month) < current_month()

        first_items, total = self.list_tasks_page(param_filter, page=1)
        if total == 0:
            return []

        all_items = list(first_items)
        total_pages = math.ceil(total / AUVO_MAX_PAGE_SIZE)

        if total_pages > 1:
            with ThreadPoolExecutor(max_workers=CONCURRENCY_LIMIT) as pool:
                futures = {
                    pool.submit(self.list_tasks_page, param_filter, page): page
                    for page in range(2, total_pages + 1)
                }
                for future in as_completed(futures):
                    items, _ = future.result()  # propaga exceção se essa página esgotou as tentativas
                    all_items.extend(items)

        if len(all_items) != total:
            message = (
                f"{year}-{month:02d}: Auvo reportou {total} tarefa(s) na 1ª página mas coletamos "
                f"{len(all_items)} no total."
            )
            if is_closed_month:
                raise AuvoError(f"{message} Mês fechado não deveria mudar — mês não será gravado, rode de novo.")
            print(f"[aviso] {message} Mês em andamento, esperado — gravando snapshot de {len(all_items)} tarefa(s).")
        return all_items


# Confirmado ao vivo (run #34967188096, 15/09/2026): a Auvo às vezes fica
# lenta demais pra servir QUALQUER página pesada por alguns minutos —
# nesse estado, tentar de novo na hora (dentro de list_tasks_page) não
# ajuda porque o problema não é uma falha pontual de rede, é a API inteira
# devagar. Um mês inteiro só deveria desistir depois de tentar de novo já
# passado um tempo real, não só milissegundos depois.
MONTH_RETRY_ATTEMPTS = 3
MONTH_RETRY_PAUSE_S = 45


def fetch_month_resilient(client: "AuvoClient", year: int, month: int) -> list[dict]:
    last_error: Exception | None = None
    for attempt in range(1, MONTH_RETRY_ATTEMPTS + 1):
        try:
            return client.fetch_month(year, month)
        except Exception as exc:  # noqa: BLE001 — repassa a última se todas as tentativas falharem
            last_error = exc
            if attempt < MONTH_RETRY_ATTEMPTS:
                print(
                    f"[retry] {year:04d}-{month:02d}: tentativa {attempt}/{MONTH_RETRY_ATTEMPTS} falhou "
                    f"({exc}) — aguardando {MONTH_RETRY_PAUSE_S}s antes de tentar o mês inteiro de novo."
                )
                time.sleep(MONTH_RETRY_PAUSE_S)
    raise last_error  # type: ignore[misc]
