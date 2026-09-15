"""Aritmética de mês (YYYY-MM) compartilhada entre backfill.py e
sync_recent.py — sem dependência externa (dateutil etc.), só stdlib."""

from __future__ import annotations

from datetime import date


def parse_month(value: str) -> tuple[int, int]:
    year_str, month_str = value.split("-")
    year, month = int(year_str), int(month_str)
    if not 1 <= month <= 12:
        raise ValueError(f"Mês inválido: {value}")
    return year, month


def current_month() -> tuple[int, int]:
    today = date.today()
    return today.year, today.month


def format_month(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def add_months(year: int, month: int, delta: int) -> tuple[int, int]:
    zero_based = (year * 12 + (month - 1)) + delta
    return zero_based // 12, zero_based % 12 + 1


def month_sequence(start: tuple[int, int], end: tuple[int, int]) -> list[tuple[int, int]]:
    """Lista de (ano, mes) de start até end, inclusive, em ordem crescente."""
    start_index = start[0] * 12 + (start[1] - 1)
    end_index = end[0] * 12 + (end[1] - 1)
    if end_index < start_index:
        raise ValueError(f"end_month ({format_month(*end)}) é anterior a start_month ({format_month(*start)}).")
    result = []
    for i in range(start_index, end_index + 1):
        year, month_zero_based = divmod(i, 12)
        result.append((year, month_zero_based + 1))
    return result
