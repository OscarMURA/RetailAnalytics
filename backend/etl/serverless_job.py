"""Dataproc Serverless entrypoint for the RetailAnalytics Spark jobs.

Submitted as the batch main file with the ``etl`` package on ``--py-files``:

    gcloud dataproc batches submit pyspark serverless_job.py \
        --py-files=gs://.../etl.zip -- <kind> <input_uri> <warehouse_uri>

``kind`` is ``reingest`` (full ETL) or ``recompute`` (K-Means + recs only). The
input/warehouse URIs are exported as RETAIL_INPUT / RETAIL_WAREHOUSE so the
shared builders read and write GCS exactly like they do locally.
"""

import os
import sys


def main() -> None:
    kind = sys.argv[1] if len(sys.argv) > 1 else "reingest"
    if len(sys.argv) > 2:
        os.environ["RETAIL_INPUT"] = sys.argv[2]
    if len(sys.argv) > 3:
        os.environ["RETAIL_WAREHOUSE"] = sys.argv[3]
    os.environ["DATAPROC_SERVERLESS"] = "1"

    # Import AFTER the env is set so etl.config resolves the gs:// roots.
    if kind == "recompute":
        sys.argv = ["recompute", "--target", "all"]
        from etl.recompute import main as run
    else:
        sys.argv = ["pipeline", "--input", os.environ.get("RETAIL_INPUT", "")]
        from etl.pipeline import main as run
    run()


if __name__ == "__main__":
    main()
