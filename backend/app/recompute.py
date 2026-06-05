"""Async Spark job manager (recompute models / re-ingest dataset).

Runs ONE heavy Spark job at a time as a detached subprocess and exposes its
state for polling. Two job kinds share the same single-flight + cooldown:

* ``recompute`` — re-run the K-Means + association-rule builders from the
  already-curated Parquet (fast-ish: skips extract/clean).
* ``reingest``  — run the FULL ETL (extract → clean → all builders) from the
  raw dataset, regenerating the whole warehouse. The dataset path defaults to
  the local ``DataSet/`` but can point at a bucket via ``DATASET_INPUT_DIR``.

Resilience policies:
* **single-flight** — only one job (of either kind) at a time (409 otherwise).
* **cooldown rate limit** — a new job is rejected (429 + Retry-After) until
  ``COOLDOWN_S`` seconds have elapsed since the previous one finished.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path
from threading import Lock
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
PYTHON = sys.executable
LOG_PATH = BACKEND_DIR / "warehouse" / ".recompute.log"

# Minimum gap between the END of one job and the START of the next.
COOLDOWN_S = 30.0

# Cap Spark's footprint so the live API keeps responding while a job runs.
# Leave ~half the cores (min 1) free for uvicorn.
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


def _command(kind: str) -> list[str]:
    if kind == "recompute":
        return [PYTHON, "-m", "etl.recompute", "--target", "all"]
    # Full ETL. Honor a configurable dataset path (e.g. a mounted bucket).
    cmd = [PYTHON, "-m", "etl.pipeline"]
    dataset = os.environ.get("DATASET_INPUT_DIR")
    if dataset:
        cmd += ["--input", dataset]
    return cmd


class _State:
    proc: subprocess.Popen[bytes] | None = None
    log_file: Any = None
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


def _poll_locked() -> None:
    """Refresh state from the subprocess return code. Call holding _lock."""
    if _state.proc is None:
        return
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
    _state.finished_at = time.time()
    _state.last_completed_at = time.monotonic()
    if rc == 0:
        _state.status = "done"
        _state.error = None
    else:
        _state.status = "error"
        _state.error = _tail_log()
    _state.proc = None


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
            "error": _state.error,
            "startedAt": _state.started_at,
            "finishedAt": _state.finished_at,
            "elapsedMs": elapsed_ms,
            "retryAfter": retry_after,
            "cooldownSeconds": COOLDOWN_S,
            "canTrigger": (not running) and retry_after == 0.0,
        }


def start(kind: str = "recompute") -> dict:
    """Try to launch a Spark job. Returns {ok, code, reason?, retryAfter?}."""
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
        _state.kind = kind
        _state.status = "running"
        _state.started_at = time.time()
        _state.finished_at = None
        _state.error = None
        return {"ok": True, "code": 202}
