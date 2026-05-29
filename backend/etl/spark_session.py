"""SparkSession factory for the ETL."""

from __future__ import annotations

from pyspark.sql import SparkSession


def get_spark(app_name: str = "RetailAnalyticsETL") -> SparkSession:
    spark = (
        SparkSession.builder.appName(app_name)
        .master("local[*]")
        .config("spark.sql.shuffle.partitions", "8")
        .config("spark.driver.memory", "4g")
        .config("spark.sql.session.timeZone", "UTC")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")
    return spark
