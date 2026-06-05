"""GCP helpers for the cloud deployment.

The backend serves DuckDB over a LOCAL copy of the Parquet warehouse that is
synced from GCS, and runs the heavy Spark work on Dataproc Serverless instead of
a local subprocess. This module wraps:

* ``sync_warehouse``        — download the GCS warehouse to the local dir,
* ``upload_job_artifacts``  — push the current ETL code (serverless_job.py +
  etl.zip) to the staging bucket so batches run the deployed code,
* ``submit_batch`` / ``get_batch_state`` — launch and poll a Serverless batch.

All credentials come from the VM's attached service account (ADC via the GCE
metadata server) — no key files.
"""

from __future__ import annotations

import os
import shutil
import tempfile
import time
import zipfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
ETL_DIR = BACKEND_DIR / "etl"

PROJECT = os.environ.get("GCP_PROJECT", "")
REGION = os.environ.get("GCP_REGION", "us-central1")
STAGING = os.environ.get("DATAPROC_STAGING", "")
SERVICE_ACCOUNT = os.environ.get("DATAPROC_SA", "")
DATAPROC_VERSION = os.environ.get("DATAPROC_VERSION", "2.2")
INPUT_URI = os.environ.get("RETAIL_INPUT", "")
WAREHOUSE_URI = os.environ.get("RETAIL_WAREHOUSE", "")
LOCAL_WAREHOUSE = os.environ.get("LOCAL_WAREHOUSE", str(BACKEND_DIR / "warehouse"))


def _split_gs(uri: str) -> tuple[str, str]:
    body = uri[len("gs://"):]
    bucket, _, prefix = body.partition("/")
    return bucket, prefix.rstrip("/")


def sync_warehouse() -> int:
    """Download the GCS warehouse into LOCAL_WAREHOUSE (fresh). Returns #files."""
    from google.cloud import storage

    bucket_name, prefix = _split_gs(WAREHOUSE_URI)
    client = storage.Client(project=PROJECT or None)
    local_root = Path(LOCAL_WAREHOUSE)
    if local_root.exists():
        shutil.rmtree(local_root)
    local_root.mkdir(parents=True, exist_ok=True)

    count = 0
    for blob in client.list_blobs(bucket_name, prefix=f"{prefix}/"):
        if blob.name.endswith("/"):
            continue
        rel = blob.name[len(prefix) + 1:]
        if not rel:
            continue
        dest = local_root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        blob.download_to_filename(str(dest))
        count += 1
    return count


def upload_job_artifacts() -> None:
    """Zip the etl package and upload it + the entrypoint to the staging bucket."""
    from google.cloud import storage

    client = storage.Client(project=PROJECT or None)
    bucket = client.bucket(STAGING)

    tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    tmp.close()
    with zipfile.ZipFile(tmp.name, "w", zipfile.ZIP_DEFLATED) as z:
        for py in ETL_DIR.rglob("*.py"):
            if "__pycache__" in py.parts:
                continue
            z.write(py, f"etl/{py.relative_to(ETL_DIR)}")
    bucket.blob("etl.zip").upload_from_filename(tmp.name)
    bucket.blob("serverless_job.py").upload_from_filename(str(ETL_DIR / "serverless_job.py"))
    os.unlink(tmp.name)


_BATCH_CLIENT = None


def _batch_client():
    global _BATCH_CLIENT
    if _BATCH_CLIENT is None:
        from google.cloud import dataproc_v1

        _BATCH_CLIENT = dataproc_v1.BatchControllerClient(
            client_options={"api_endpoint": f"{REGION}-dataproc.googleapis.com:443"}
        )
    return _BATCH_CLIENT


def submit_batch(kind: str) -> str:
    """Launch a Dataproc Serverless batch for `kind` and return its resource name."""
    from google.cloud import dataproc_v1

    parent = f"projects/{PROJECT}/locations/{REGION}"
    batch_id = f"{kind}-{int(time.time())}"
    batch = dataproc_v1.Batch(
        pyspark_batch=dataproc_v1.PySparkBatch(
            main_python_file_uri=f"gs://{STAGING}/serverless_job.py",
            python_file_uris=[f"gs://{STAGING}/etl.zip"],
            args=[kind, INPUT_URI, WAREHOUSE_URI],
        ),
        runtime_config=dataproc_v1.RuntimeConfig(version=DATAPROC_VERSION),
        environment_config=dataproc_v1.EnvironmentConfig(
            execution_config=dataproc_v1.ExecutionConfig(
                service_account=SERVICE_ACCOUNT,
                staging_bucket=STAGING,
            ),
        ),
    )
    client = _batch_client()
    client.create_batch(parent=parent, batch=batch, batch_id=batch_id)
    return f"{parent}/batches/{batch_id}"


def get_batch_state(name: str) -> tuple[str, str]:
    """Return (state, message). state ∈ PENDING|RUNNING|SUCCEEDED|FAILED|CANCELLED."""
    client = _batch_client()
    b = client.get_batch(name=name)
    return b.state.name, (b.state_message or "")
