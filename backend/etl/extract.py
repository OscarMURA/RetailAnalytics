"""Extract: read the raw pipe-delimited source CSVs (transactions + product map)."""

from __future__ import annotations

import re
from pathlib import Path

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F
from pyspark.sql import types as T

from etl import config


def _products_path(input_dir: str, filename: str) -> str:
    return f"{str(input_dir).rstrip('/')}/Products/{filename}"


def read_transactions(spark: SparkSession, input_dir: str) -> DataFrame:
    """Raw transactions: NO header, columns date|storeId|customerId|productCodes."""
    schema = T.StructType(
        [
            T.StructField("date", T.StringType()),
            T.StructField("storeId", T.StringType()),
            T.StructField("customerId", T.StringType()),
            T.StructField("productCodes", T.StringType()),
        ]
    )
    base = str(input_dir).rstrip("/")
    reader = spark.read.option("sep", "|").option("header", "false").schema(schema)
    if config.is_remote(base):
        # GCS/Hadoop expands the glob fine (bucket paths have no spaces).
        return reader.csv(f"{base}/Transactions/*_Tran.csv")
    # Local: enumerate explicitly — Hadoop's globber fails on paths with spaces.
    files = sorted(str(p) for p in (Path(base) / "Transactions").glob("*_Tran.csv"))
    if not files:
        raise FileNotFoundError(f"No *_Tran.csv files under {base}/Transactions")
    return reader.csv(files)


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _spark_col(name: str):
    return F.col(f"`{name}`")


def _pick_col(columns: list[str], candidates: set[str], contains: tuple[str, ...] = ()) -> str | None:
    normalized = {c: _norm(c) for c in columns}
    for col, key in normalized.items():
        if key in candidates:
            return col
    if contains:
        for col, key in normalized.items():
            if any(token in key for token in contains):
                return col
    return None


def _empty_product_names(spark: SparkSession) -> DataFrame:
    schema = T.StructType(
        [
            T.StructField("product_id", T.StringType()),
            T.StructField("product_name", T.StringType()),
        ]
    )
    return spark.createDataFrame([], schema)


def read_product_category(spark: SparkSession, input_dir: Path) -> DataFrame:
    """ProductCategory.csv with optional product-name column.

    Current dataset copy has only v.Code_pr|v.code. If a richer catalog adds a
    name/description column, it is exposed as productName.
    """
    raw = (
        spark.read.option("sep", "|")
        .option("header", "true")
        .option("inferSchema", "false")
        .csv(_products_path(input_dir, "ProductCategory.csv"))
    )
    cols = raw.columns
    product_col = _pick_col(
        cols,
        {"vcodepr", "productcode", "productid", "codepr", "codigoproducto", "codproducto"},
        ("product", "codepr"),
    ) or cols[0]
    category_col = _pick_col(
        [c for c in cols if c != product_col],
        {"vcode", "categorycode", "categoryid", "code", "codigocategoria", "codcategoria"},
        ("category", "cat"),
    ) or (cols[1] if len(cols) > 1 else cols[0])
    name_col = _pick_col(
        [c for c in cols if c not in {product_col, category_col}],
        {"productname", "nombreproducto", "nombre", "name", "descripcion", "description", "producto"},
        ("name", "nombre", "descripcion", "description"),
    )

    selected = raw.select(
        _spark_col(product_col).cast("string").alias("productCode"),
        _spark_col(category_col).cast("string").alias("categoryCode"),
        (_spark_col(name_col).cast("string") if name_col else F.lit(None).cast("string")).alias("productName"),
    )
    return selected


def read_product_names(spark: SparkSession, input_dir: Path) -> DataFrame:
    """Read optional product-name catalog if present.

    Supported files under Products/: Products.csv, Product.csv, ProductNames.csv,
    ProductCatalog.csv, ProductCatalogue.csv. Expected shape: a product code
    column and a name/description column, with any reasonable header variant.
    """
    # Remote (gs://) datasets in this project ship no name catalog; skip the
    # filesystem probing (Path.exists doesn't work on object storage).
    if config.is_remote(input_dir):
        return _empty_product_names(spark)
    products_dir = Path(input_dir) / "Products"
    for filename in [
        "Products.csv",
        "Product.csv",
        "ProductNames.csv",
        "ProductCatalog.csv",
        "ProductCatalogue.csv",
        "ProductMaster.csv",
    ]:
        path = products_dir / filename
        if not path.exists():
            continue
        raw = spark.read.option("sep", "|").option("header", "true").csv(str(path))
        cols = raw.columns
        if len(cols) < 2:
            continue
        code_col = _pick_col(
            cols,
            {"productcode", "productid", "code", "codigo", "codigoproducto", "codproducto", "vcodepr"},
            ("product", "code", "codigo"),
        ) or cols[0]
        name_col = _pick_col(
            [c for c in cols if c != code_col],
            {"productname", "nombreproducto", "nombre", "name", "descripcion", "description", "producto"},
            ("name", "nombre", "descripcion", "description", "producto"),
        )
        if not name_col:
            continue
        return raw.select(
            F.trim(_spark_col(code_col).cast("string")).alias("product_id"),
            F.trim(_spark_col(name_col).cast("string")).alias("product_name"),
        ).where(F.col("product_id").isNotNull() & (F.col("product_id") != ""))
    return _empty_product_names(spark)


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
        .csv(_products_path(input_dir, "Categories.csv"))
    )
