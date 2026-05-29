"""Parquet warehouse IO (idempotent read/write to backend/warehouse/)."""

from __future__ import annotations

from pathlib import Path

from pyspark.sql import DataFrame, SparkSession


def write(df: DataFrame, path: Path) -> None:
    """Idempotent overwrite write."""
    df.write.mode("overwrite").parquet(str(path))


def read(spark: SparkSession, path: Path) -> DataFrame:
    return spark.read.parquet(str(path))
