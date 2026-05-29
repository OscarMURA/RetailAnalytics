"""Single, single-threaded DuckDB connection over the Parquet warehouse.

DuckDB's Python client segfaults the process under concurrent access — both
sharing one connection across threads AND creating many :memory: connections
rapidly are unsafe, and its intra-query parallel engine compounds it. The safe
configuration, verified under load:

  * exactly ONE connection, built once at import (never concurrently),
  * pinned to a single DuckDB worker thread (``SET threads=1``),
  * every query serialized behind a process-global lock.

Views are ``read_parquet`` over the warehouse datasets, so re-running the ETL is
picked up by new queries without a restart.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import duckdb

BACKEND_DIR = Path(__file__).resolve().parents[1]
WAREHOUSE = BACKEND_DIR / "warehouse"

_DATASETS = [
    "purchases",
    "baskets",
    "daily_sales",
    "customer_profiles",
    "product_catalog",
    "category_breakdown",
    "overview",
]

# All DuckDB work runs on ONE dedicated worker thread. The connection is created
# on that thread and never touched by any other, which is the only configuration
# that does not segfault under concurrent requests. Every query is submitted here
# and the caller blocks on the result, so requests are naturally serialized.
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="duckdb")


def _glob(dataset: str) -> str:
    return str(WAREHOUSE / dataset / "*.parquet")


def _build_con() -> duckdb.DuckDBPyConnection | None:
    if not warehouse_ready():
        return None
    con = duckdb.connect(database=":memory:")
    con.execute("SET threads=1")
    con.execute("PRAGMA disable_progress_bar")
    for name in _DATASETS:
        con.execute(f"CREATE VIEW {name} AS SELECT * FROM read_parquet('{_glob(name)}')")
    return con


def warehouse_ready() -> bool:
    return (WAREHOUSE / "overview").exists()


def _run(sql: str, params: list) -> list[dict]:
    # Fresh single-threaded connection per query, fully created and closed on the
    # one executor thread. Nothing is shared, so there is no DuckDB state for a
    # concurrent request to corrupt. Connecting over read-only Parquet is ~ms.
    con = _build_con()
    if con is None:
        return []
    try:
        cur = con.execute(sql, params)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
    finally:
        con.close()


def query(sql: str, params: list | None = None) -> list[dict]:
    return _executor.submit(_run, sql, params or []).result()


def query_one(sql: str, params: list | None = None) -> dict | None:
    rows = query(sql, params)
    return rows[0] if rows else None
