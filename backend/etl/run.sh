#!/usr/bin/env bash
# Re-run the Spark ETL to (re)generate the Parquet warehouse in backend/warehouse/.
# Usage: ./run.sh [--input /path/to/DataSet/DataSet]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$(dirname "$HERE")"
cd "$BACKEND"
exec .venv/bin/python -m etl.pipeline "$@"
