"""Extract: read the raw pipe-delimited source CSVs (transactions + product map)."""

from __future__ import annotations

from pathlib import Path

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import types as T


def read_transactions(spark: SparkSession, input_dir: Path) -> DataFrame:
    """Raw transactions: NO header, columns date|storeId|customerId|productCodes."""
    schema = T.StructType(
        [
            T.StructField("date", T.StringType()),
            T.StructField("storeId", T.StringType()),
            T.StructField("customerId", T.StringType()),
            T.StructField("productCodes", T.StringType()),
        ]
    )
    return (
        spark.read.option("sep", "|")
        .option("header", "false")
        .schema(schema)
        .csv(str(input_dir / "Transactions" / "*_Tran.csv"))
    )


def read_product_category(spark: SparkSession, input_dir: Path) -> DataFrame:
    """ProductCategory.csv HAS header v.Code_pr|v.code → productCode|categoryCode."""
    schema = T.StructType(
        [
            T.StructField("productCode", T.StringType()),
            T.StructField("categoryCode", T.StringType()),
        ]
    )
    return (
        spark.read.option("sep", "|")
        .option("header", "true")
        .schema(schema)
        .csv(str(input_dir / "Products" / "ProductCategory.csv"))
    )


def read_categories(spark: SparkSession, input_dir: Path) -> DataFrame:
    """Categories.csv NO header → categoryCode|categoryName."""
    schema = T.StructType(
        [
            T.StructField("categoryCode", T.IntegerType()),
            T.StructField("categoryName", T.StringType()),
        ]
    )
    return (
        spark.read.option("sep", "|")
        .option("header", "false")
        .schema(schema)
        .csv(str(input_dir / "Products" / "Categories.csv"))
    )
