"""Async Spark job manager (recompute models / re-ingest dataset).

Runs ONE heavy Spark job at a time and exposes its state for polling. Two job
kinds share the same single-flight + cooldown:

* ``recompute`` — re-run the K-Means + association-rule builders.
* ``reingest``  — run the FULL ETL from the raw dataset.

Two execution backends, chosen by the ``JOB_BACKEND`` env var:

* ``local``    — a detached local Spark subprocess (dev; default).
* ``dataproc`` — a Dataproc Serverless batch that reads/writes the GCS
  warehouse; on success the warehouse is synced down to the local copy DuckDB
  serves (cloud deployment).

Resilience policies (both backends):
* **single-flight** — only one job at a time (409 otherwise).
* **cooldown rate limit** — a new job is rejected (429 + Retry-After) until
  ``COOLDOWN_S`` seconds have elapsed since the previous one finished.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path
from threading import Lock, Thread
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
PYTHON = sys.executable
LOG_PATH = BACKEND_DIR / "warehouse" / ".recompute.log"

JOB_BACKEND = os.environ.get("JOB_BACKEND", "local")
COOLDOWN_S = 30.0

# Local-Spark footprint cap (so a local job does not starve the API).
_CORES = os.cpu_count() or 4
_SPARK_CORES = max(1, _CORES // 2)
_JOB_ENV = {
    **os.environ,
    "SPARK_MASTER": f"local[{_SPARK_CORES}]",
    "SPARK_DRIVER_MEMORY": os.environ.get("RECOMPUTE_SPARK_MEMORY", "2g"),
    "SPARK_SHUFFLE_PARTITIONS": str(_SPARK_CORES * 2),
}

LABELS = {
    "recompute": "Recálculo de modelos (K-Means + reglas)",
    "reingest": "Reingesta del dataset (ETL completo)",
}

_RUNNING_BATCH_STATES = {"PENDING", "RUNNING", "STATE_UNSPECIFIED"}


def _command(kind: str) -> list[str]:
    if kind == "recompute":
        return [PYTHON, "-m", "etl.recompute", "--target", "all"]
    cmd = [PYTHON, "-m", "etl.pipeline"]
    dataset = os.environ.get("DATASET_INPUT_DIR")
    if dataset:
        cmd += ["--input", dataset]
    return cmd


class _State:
    # local
    proc: subprocess.Popen[bytes] | None = None
    log_file: Any = None
    # dataproc
    batch_name: str | None = None
    syncing: bool = False
    # shared
    kind: str | None = None
    status: str = "idle"  # idle | running | done | error
    started_at: float | None = None
    finished_at: float | None = None
    last_completed_at: float | None = None  # monotonic; for cooldown
    error: str | None = None


_state = _State()
_lock = Lock()


def _tail_log(limit: int = 1500) -> str:
    try:
        text = LOG_PATH.read_text(errors="replace")
        return text[-limit:].strip() or "El proceso falló sin salida."
    except OSError:
        return "El proceso falló (sin log disponible)."


def _mark_done(rc_ok: bool, error: str | None) -> None:
    _state.finished_at = time.time()
    _state.last_completed_at = time.monotonic()
    _state.status = "done" if rc_ok else "error"
    _state.error = None if rc_ok else error
    _state.proc = None
    _state.batch_name = None
    _state.syncing = False


def _finish_sync_bg() -> None:
    """Background: pull the fresh GCS warehouse to local, then mark done."""
    from app import cloud

    try:
        cloud.sync_warehouse()
        with _lock:
            _mark_done(True, None)
    except Exception as exc:  # noqa: BLE001 — surface any sync failure to the UI
        with _lock:
            _mark_done(False, f"Warehouse sync falló: {exc}")


def _poll_locked() -> None:
    """Refresh state from the running job. Call holding _lock."""
    # Local subprocess.
    if _state.proc is not None:
        rc = _state.proc.poll()
        if rc is None:
            _state.status = "running"
            return
        if _state.log_file is not None:
            try:
                _state.log_file.close()
            except OSError:
                pass
            _state.log_file = None
        _mark_done(rc == 0, None if rc == 0 else _tail_log())
        return

    # Dataproc Serverless batch.
    if _state.batch_name is not None:
        if _state.syncing:
            _state.status = "running"  # batch done, warehouse sync in progress
            return
        from app import cloud

        try:
            batch_state, message = cloud.get_batch_state(_state.batch_name)
        except Exception:  # noqa: BLE001 — transient API error; stay running, retry next poll
            _state.status = "running"
            return
        if batch_state in _RUNNING_BATCH_STATES:
            _state.status = "running"
            return
        if batch_state == "SUCCEEDED":
            _state.syncing = True
            _state.status = "running"
            Thread(target=_finish_sync_bg, daemon=True).start()
            return
        _mark_done(False, message or f"Batch en estado {batch_state}.")
        return


def _retry_after_locked() -> float:
    if _state.status == "running" or _state.last_completed_at is None:
        return 0.0
    elapsed = time.monotonic() - _state.last_completed_at
    return max(0.0, round(COOLDOWN_S - elapsed, 1))


def status() -> dict:
    with _lock:
        _poll_locked()
        running = _state.status == "running"
        retry_after = _retry_after_locked()
        elapsed_ms = (
            int((time.time() - _state.started_at) * 1000)
            if running and _state.started_at is not None
            else None
        )
        return {
            "status": _state.status,
            "running": running,
            "kind": _state.kind,
            "label": LABELS.get(_state.kind or "", ""),
            "backend": JOB_BACKEND,
            "error": _state.error,
            "startedAt": _state.started_at,
            "finishedAt": _state.finished_at,
            "elapsedMs": elapsed_ms,
            "retryAfter": retry_after,
            "cooldownSeconds": COOLDOWN_S,
            "canTrigger": (not running) and retry_after == 0.0,
        }


def _start_local(kind: str) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    log_file = open(LOG_PATH, "wb")
    _state.proc = subprocess.Popen(
        _command(kind),
        cwd=str(BACKEND_DIR),
        stdout=log_file,
        stderr=subprocess.STDOUT,
        env=_JOB_ENV,
    )
    _state.log_file = log_file


def _start_dataproc(kind: str) -> None:
    from app import cloud

    _state.batch_name = cloud.submit_batch(kind)
    _state.syncing = False


def start(kind: str = "recompute") -> dict:
    """Try to launch a job. Returns {ok, code, reason?, retryAfter?}."""
    if kind not in LABELS:
        return {"ok": False, "code": 400, "reason": f"Tipo de job inválido: {kind}."}
    with _lock:
        _poll_locked()
        if _state.status == "running":
            running_label = LABELS.get(_state.kind or "", "un proceso")
            return {"ok": False, "code": 409, "reason": f"Ya hay {running_label} en progreso."}
        retry_after = _retry_after_locked()
        if retry_after > 0.0:
            return {
                "ok": False,
                "code": 429,
                "reason": f"Espera {int(retry_after) + 1}s antes de ejecutar otro proceso.",
                "retryAfter": retry_after,
            }
        try:
            if JOB_BACKEND == "dataproc":
                _start_dataproc(kind)
            else:
                _start_local(kind)
        except Exception as exc:  # noqa: BLE001 — report a clean failure to the UI
            return {"ok": False, "code": 500, "reason": f"No se pudo lanzar el job: {exc}"}
        _state.kind = kind
        _state.status = "running"
        _state.started_at = time.time()
        _state.finished_at = None
        _state.error = None
        return {"ok": True, "code": 202}
