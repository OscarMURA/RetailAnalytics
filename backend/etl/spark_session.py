"""SparkSession factory for the ETL."""

from __future__ import annotations

import os

from pyspark.sql import SparkSession


def get_spark(app_name: str = "RetailAnalyticsETL") -> SparkSession:
    # Env overrides let the on-demand recompute cap cores/memory so the live API
    # keeps responding while Spark runs (the full batch ETL uses the defaults).
    master = os.environ.get("SPARK_MASTER", "local[*]")
    driver_memory = os.environ.get("SPARK_DRIVER_MEMORY", "4g")
    shuffle_partitions = os.environ.get("SPARK_SHUFFLE_PARTITIONS", "8")
    spark = (
        SparkSession.builder.appName(app_name)
        .master(master)
        .config("spark.sql.shuffle.partitions", shuffle_partitions)
        .config("spark.driver.memory", driver_memory)
        .config("spark.sql.session.timeZone", "UTC")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")
    return spark
