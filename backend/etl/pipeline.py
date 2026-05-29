"""RetailAnalytics ETL — Apache Spark job.

Reads the raw pipe-delimited CSV dataset, cleans/validates it, explodes the
product baskets, joins products to categories, computes every aggregate the
FastAPI layer serves, and writes them as JSON into ``backend/serving/``.

The job is re-runnable: point ``--input`` at a directory holding the same
``Transactions/`` + ``Products/`` layout and re-run to refresh all serving
artifacts ("incorporación de nuevos datos").

DATA INTERPRETATION RULES (see README for the full rationale):
  - 1 CSV row = 1 transaction. Total transacciones = row count.
  - units: explode the space-separated basket; each product-code occurrence = 1
    unit. Total unidades = sum of basket lengths.
  - Client identity = composite (storeId, customerId); same numeric customerId
    in different stores is a different person. Label: CUST-{store}-{customer}.
  - Product -> category: productCode -> ProductCategory -> deterministic single
    category (MIN categoryCode) -> Categories name. Unmapped -> "Sin categoría".
  - KPI deltas: most-recent 30-day window vs the immediately preceding 30-day
    window, relative to the dataset MAX date.
  - avgTicket = total units / total transactions.
  - No time-of-day exists, so "hour distribution" is replaced by weekday.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
from datetime import timedelta
from pathlib import Path

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql import types as T

UNMAPPED_CATEGORY = "Sin categoría"
WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
# Spark dayofweek(): 1=Sunday .. 7=Saturday. We map to 0=Mon .. 6=Sun.
TOP_CATEGORY_LIMIT = 6


def build_spark() -> SparkSession:
    return (
        SparkSession.builder.appName("RetailAnalyticsETL")
        .master("local[*]")
        .config("spark.sql.shuffle.partitions", "8")
        .config("spark.driver.memory", "4g")
        .config("spark.sql.session.timeZone", "UTC")
        .getOrCreate()
    )


def read_transactions(spark: SparkSession, input_dir: Path):
    schema = T.StructType(
        [
            T.StructField("date", T.StringType()),
            T.StructField("storeId", T.StringType()),
            T.StructField("customerId", T.StringType()),
            T.StructField("productCodes", T.StringType()),
        ]
    )
    raw = (
        spark.read.option("sep", "|")
        .option("header", "false")
        .schema(schema)
        .csv(str(input_dir / "Transactions" / "*_Tran.csv"))
    )
    # Clean / validate: drop rows with no date or empty basket.
    df = (
        raw.withColumn("date", F.to_date("date", "yyyy-MM-dd"))
        .withColumn("storeId", F.trim("storeId"))
        .withColumn("customerId", F.trim("customerId"))
        .withColumn("basketRaw", F.trim("productCodes"))
        .filter(F.col("date").isNotNull())
        .filter(F.col("basketRaw").isNotNull() & (F.col("basketRaw") != ""))
        .withColumn("clientId", F.concat_ws("-", F.lit("CUST"), "storeId", "customerId"))
    )
    return df


def read_category_map(spark: SparkSession, input_dir: Path):
    """productCode -> deterministic single categoryName (min categoryCode)."""
    pc_schema = T.StructType(
        [
            T.StructField("productCode", T.StringType()),
            T.StructField("categoryCode", T.StringType()),
        ]
    )
    product_category = (
        spark.read.option("sep", "|")
        .option("header", "true")  # file has header v.Code_pr|v.code
        .schema(pc_schema)
        .csv(str(input_dir / "Products" / "ProductCategory.csv"))
        .filter(F.col("productCode").isNotNull() & F.col("categoryCode").isNotNull())
        .withColumn("productCode", F.trim("productCode"))
        .withColumn("categoryCode", F.trim("categoryCode").cast(T.IntegerType()))
        .filter(F.col("categoryCode").isNotNull())
    )
    # Deterministic single category per product: smallest category code.
    deterministic = product_category.groupBy("productCode").agg(
        F.min("categoryCode").alias("categoryCode")
    )

    cat_schema = T.StructType(
        [
            T.StructField("categoryCode", T.IntegerType()),
            T.StructField("categoryName", T.StringType()),
        ]
    )
    categories = (
        spark.read.option("sep", "|")
        .option("header", "false")
        .schema(cat_schema)
        .csv(str(input_dir / "Products" / "Categories.csv"))
        .withColumn("categoryName", F.trim("categoryName"))
    )

    return (
        deterministic.join(categories, on="categoryCode", how="left")
        .select("productCode", "categoryName")
    )


def explode_units(transactions, category_map):
    """One row per product-code occurrence, joined to its category."""
    units = (
        transactions.withColumn(
            "productCode", F.explode(F.split(F.col("basketRaw"), r"\s+"))
        )
        .withColumn("productCode", F.trim("productCode"))
        .filter(F.col("productCode") != "")
    )
    units = units.join(F.broadcast(category_map), on="productCode", how="left").withColumn(
        "categoryName", F.coalesce(F.col("categoryName"), F.lit(UNMAPPED_CATEGORY))
    )
    return units


# --------------------------------------------------------------------------- #
# Aggregate computations                                                       #
# --------------------------------------------------------------------------- #


def compute_kpis(transactions, units, max_date):
    total_transactions = transactions.count()
    total_units = units.count()
    unique_customers = transactions.select("clientId").distinct().count()
    distinct_products = units.select("productCode").distinct().count()

    cur_start = max_date - timedelta(days=29)
    prev_start = max_date - timedelta(days=59)
    prev_end = max_date - timedelta(days=30)

    def window_counts(df):
        cur = df.filter((F.col("date") >= cur_start) & (F.col("date") <= max_date))
        prev = df.filter((F.col("date") >= prev_start) & (F.col("date") <= prev_end))
        return cur, prev

    tx_cur, tx_prev = window_counts(transactions)
    un_cur, un_prev = window_counts(units)

    cur_tx, prev_tx = tx_cur.count(), tx_prev.count()
    cur_un, prev_un = un_cur.count(), un_prev.count()
    cur_cust = tx_cur.select("clientId").distinct().count()
    prev_cust = tx_prev.select("clientId").distinct().count()
    cur_prod = un_cur.select("productCode").distinct().count()
    prev_prod = un_prev.select("productCode").distinct().count()

    def delta(cur, prev):
        if prev == 0:
            return 0.0
        return round((cur - prev) / prev * 100.0, 1)

    def direction(d):
        if d > 0.05:
            return "up"
        if d < -0.05:
            return "down"
        return "flat"

    def kpi(key, label, value, cur, prev, icon):
        d = delta(cur, prev)
        return {
            "key": key,
            "label": label,
            "value": value,
            "delta": d,
            "direction": direction(d),
            "icon": icon,
        }

    return {
        "kpis": [
            kpi("totalUnits", "Unidades vendidas", total_units, cur_un, prev_un, "package"),
            kpi("totalTransactions", "Transacciones", total_transactions, cur_tx, prev_tx, "activity"),
            kpi("uniqueCustomers", "Clientes únicos", unique_customers, cur_cust, prev_cust, "users"),
            kpi("distinctProducts", "Productos distintos", distinct_products, cur_prod, prev_prod, "box"),
        ]
    }


def compute_top_products(units, limit=50):
    rows = (
        units.groupBy("productCode")
        .agg(F.count(F.lit(1)).alias("units"), F.first("categoryName").alias("category"))
        .orderBy(F.desc("units"))
        .limit(limit)
        .collect()
    )
    out = []
    for i, r in enumerate(rows):
        out.append(
            {
                "rank": i + 1,
                "code": r["productCode"],
                "label": f"Producto {r['productCode']}",
                "category": r["category"],
                "units": int(r["units"]),
            }
        )
    return out


def compute_top_customers(units, limit=50):
    rows = (
        units.groupBy("clientId")
        .agg(F.count(F.lit(1)).alias("units"))
        .orderBy(F.desc("units"))
        .limit(limit)
        .collect()
    )
    return [
        {"rank": i + 1, "id": r["clientId"], "units": int(r["units"])}
        for i, r in enumerate(rows)
    ]


def compute_categories(units, total_units):
    rows = (
        units.groupBy("categoryName")
        .agg(F.count(F.lit(1)).alias("units"))
        .orderBy(F.desc("units"))
        .collect()
    )
    total_count = (
        units.select("categoryName")
        .distinct()
        .filter(F.col("categoryName") != UNMAPPED_CATEGORY)
        .count()
    )
    active_count = len([r for r in rows if r["categoryName"] != UNMAPPED_CATEGORY])

    top = rows[:TOP_CATEGORY_LIMIT]
    rest = rows[TOP_CATEGORY_LIMIT:]
    items = [
        {"name": r["categoryName"], "value": round(r["units"] / total_units * 100.0, 1)}
        for r in top
    ]
    if rest:
        otros = sum(r["units"] for r in rest)
        items.append({"name": "Otros", "value": round(otros / total_units * 100.0, 1)})
    return {"items": items, "activeCount": active_count, "totalCount": total_count}


def compute_calendar(transactions, max_date, days=90):
    start = max_date - timedelta(days=days - 1)
    daily = (
        transactions.filter((F.col("date") >= start) & (F.col("date") <= max_date))
        .groupBy("date")
        .agg(F.count(F.lit(1)).alias("count"))
        .collect()
    )
    by_date = {r["date"]: int(r["count"]) for r in daily}
    seq = []
    d = start
    while d <= max_date:
        seq.append((d, by_date.get(d, 0)))
        d += timedelta(days=1)
    counts = [c for _, c in seq]
    max_count = max(counts) if counts else 0
    days_out = []
    peak = {"date": None, "count": 0}
    for d, c in seq:
        days_out.append(
            {
                "date": d.isoformat(),
                "count": c,
                "intensity": round(c / max_count, 3) if max_count else 0.0,
                "dow": (d.weekday()),  # 0=Mon..6=Sun
            }
        )
        if c > peak["count"]:
            peak = {"date": d.isoformat(), "count": c}
    daily_avg = round(sum(counts) / len(counts), 1) if counts else 0.0

    # trend30: last 30 days vs previous 30 days (transaction counts).
    cur = [c for d, c in seq if d > max_date - timedelta(days=30)]
    prev = [c for d, c in seq if max_date - timedelta(days=60) < d <= max_date - timedelta(days=30)]
    cur_sum, prev_sum = sum(cur), sum(prev)
    if prev_sum == 0:
        pct = 0.0
    else:
        pct = round((cur_sum - prev_sum) / prev_sum * 100.0, 1)
    direction = "up" if pct > 0.05 else "down" if pct < -0.05 else "flat"

    return {
        "days": days_out,
        "peakDay": peak,
        "dailyAvg": daily_avg,
        "trend30": {"pct": pct, "direction": direction},
    }


def compute_coverage(transactions, units, categories_summary, total_units, total_transactions):
    active_stores = transactions.select("storeId").distinct().count()
    rotating_products = units.select("productCode").distinct().count()
    avg_ticket = round(total_units / total_transactions, 2) if total_transactions else 0.0
    return {
        "activeCategories": categories_summary["activeCount"],
        "totalCategories": categories_summary["totalCount"],
        "rotatingProducts": rotating_products,
        "activeStores": active_stores,
        "avgTicket": avg_ticket,
    }


def compute_timeseries(units):
    base = units.withColumn("d", F.col("date"))
    out = {}
    for gran, col in (
        ("day", F.col("date")),
        ("week", F.date_trunc("week", F.col("date").cast("timestamp")).cast("date")),
        ("month", F.date_trunc("month", F.col("date").cast("timestamp")).cast("date")),
    ):
        rows = (
            base.withColumn("bucket", col)
            .groupBy("bucket")
            .agg(F.count(F.lit(1)).alias("units"))
            .orderBy("bucket")
            .collect()
        )
        points = [{"date": r["bucket"].isoformat(), "units": int(r["units"])} for r in rows]
        vals = [p["units"] for p in points]
        out[gran] = {
            "total": sum(vals),
            "avg": round(sum(vals) / len(vals), 1) if vals else 0.0,
            "peak": max(vals) if vals else 0,
            "points": points,
        }
    return out


def compute_boxplot_categories(units):
    # Top categories by units (exclude Sin categoría) -> units-per-transaction dist.
    top_cats = [
        r["categoryName"]
        for r in (
            units.filter(F.col("categoryName") != UNMAPPED_CATEGORY)
            .groupBy("categoryName")
            .agg(F.count(F.lit(1)).alias("u"))
            .orderBy(F.desc("u"))
            .limit(TOP_CATEGORY_LIMIT)
            .collect()
        )
    ]
    # units-per-transaction within a category = count of that category's items in a basket row.
    per_tx = (
        units.filter(F.col("categoryName").isin(top_cats))
        .groupBy("categoryName", "storeId", "customerId", "date", "basketRaw")
        .agg(F.count(F.lit(1)).alias("cnt"))
    )
    out = []
    for cat in top_cats:
        sub = per_tx.filter(F.col("categoryName") == cat)
        qs = sub.approxQuantile("cnt", [0.0, 0.25, 0.5, 0.75, 1.0], 0.01)
        if not qs or len(qs) < 5:
            continue
        out.append(
            {
                "category": cat,
                "min": qs[0],
                "q1": qs[1],
                "median": qs[2],
                "q3": qs[3],
                "max": qs[4],
            }
        )
    return out


def compute_weekday_distribution(transactions, units):
    tx = (
        transactions.withColumn("dow", (F.dayofweek("date") + 5) % 7)  # 0=Mon..6=Sun
        .groupBy("dow")
        .agg(F.count(F.lit(1)).alias("transactions"))
    )
    un = (
        units.withColumn("dow", (F.dayofweek("date") + 5) % 7)
        .groupBy("dow")
        .agg(F.count(F.lit(1)).alias("units"))
    )
    joined = {r["dow"]: r for r in tx.join(un, on="dow", how="outer").collect()}
    out = []
    for dow in range(7):
        r = joined.get(dow)
        out.append(
            {
                "dow": dow,
                "label": WEEKDAY_LABELS[dow],
                "units": int(r["units"]) if r and r["units"] else 0,
                "transactions": int(r["transactions"]) if r and r["transactions"] else 0,
            }
        )
    return out


def compute_correlation(transactions, units, max_date):
    """Per-client features -> 5x5 Pearson correlation matrix."""
    max_lit = F.lit(max_date)
    per_client = transactions.groupBy("clientId").agg(
        F.count(F.lit(1)).alias("frequency"),
        F.max("date").alias("lastDate"),
    )
    basket_sizes = (
        units.groupBy("clientId", "storeId", "customerId", "date", "basketRaw")
        .agg(F.count(F.lit(1)).alias("bsize"))
        .groupBy("clientId")
        .agg(F.avg("bsize").alias("avgBasket"))
    )
    diversity = units.groupBy("clientId").agg(
        F.countDistinct("productCode").alias("distinctProducts"),
        F.countDistinct("categoryName").alias("distinctCategories"),
    )
    feats = (
        per_client.join(basket_sizes, "clientId", "left")
        .join(diversity, "clientId", "left")
        .withColumn("recency", F.datediff(max_lit, F.col("lastDate")))
        .select(
            F.col("frequency").cast("double"),
            F.col("avgBasket").cast("double"),
            F.col("distinctProducts").cast("double"),
            F.col("distinctCategories").cast("double"),
            F.col("recency").cast("double"),
        )
        .na.fill(0.0)
    )
    cols = ["frequency", "avgBasket", "distinctProducts", "distinctCategories", "recency"]
    n = len(cols)
    matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        matrix[i][i] = 1.0
        for j in range(i + 1, n):
            c = feats.stat.corr(cols[i], cols[j])
            c = round(c, 3) if c is not None else 0.0
            matrix[i][j] = c
            matrix[j][i] = c
    return {
        "labels": ["Frecuencia", "Cant. promedio", "Div. productos", "Div. categorías", "Recencia"],
        "matrix": matrix,
    }


# --------------------------------------------------------------------------- #


def write_json(serving_dir: Path, name: str, payload) -> None:
    path = serving_dir / f"{name}.json"
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    print(f"  wrote {path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="RetailAnalytics Spark ETL")
    default_input = Path(__file__).resolve().parents[2] / "DataSet" / "DataSet"
    default_serving = Path(__file__).resolve().parents[1] / "serving"
    parser.add_argument("--input", default=str(default_input), help="Dataset root (Transactions/ + Products/)")
    parser.add_argument("--serving", default=str(default_serving), help="Output dir for JSON artifacts")
    args = parser.parse_args()

    input_dir = Path(args.input)
    serving_dir = Path(args.serving)
    serving_dir.mkdir(parents=True, exist_ok=True)

    spark = build_spark()
    spark.sparkContext.setLogLevel("WARN")
    print(f"[ETL] input={input_dir}  serving={serving_dir}")

    transactions = read_transactions(spark, input_dir).cache()
    category_map = read_category_map(spark, input_dir)
    units = explode_units(transactions, category_map).cache()

    max_date = transactions.agg(F.max("date")).collect()[0][0]
    min_date = transactions.agg(F.min("date")).collect()[0][0]
    total_transactions = transactions.count()
    total_units = units.count()
    print(f"[ETL] date range {min_date}..{max_date}  tx={total_transactions}  units={total_units}")

    print("[ETL] computing aggregates...")
    kpis = compute_kpis(transactions, units, max_date)
    top_products = compute_top_products(units)
    top_customers = compute_top_customers(units)
    categories = compute_categories(units, total_units)
    calendar = compute_calendar(transactions, max_date, days=90)
    coverage = compute_coverage(transactions, units, categories, total_units, total_transactions)
    timeseries = compute_timeseries(units)
    boxplot = compute_boxplot_categories(units)
    weekday = compute_weekday_distribution(transactions, units)
    correlation = compute_correlation(transactions, units, max_date)

    meta = {
        "minDate": min_date.isoformat(),
        "maxDate": max_date.isoformat(),
        "totalTransactions": total_transactions,
        "totalUnits": total_units,
    }

    print("[ETL] writing serving artifacts...")
    write_json(serving_dir, "kpis", kpis)
    write_json(serving_dir, "top_products", top_products)
    write_json(serving_dir, "top_customers", top_customers)
    write_json(serving_dir, "categories", categories)
    write_json(serving_dir, "calendar", calendar)
    write_json(serving_dir, "coverage", coverage)
    write_json(serving_dir, "timeseries", timeseries)
    write_json(serving_dir, "boxplot_categories", boxplot)
    write_json(serving_dir, "weekday_distribution", weekday)
    write_json(serving_dir, "correlation", correlation)
    write_json(serving_dir, "meta", meta)

    spark.stop()
    print("[ETL] done.")


if __name__ == "__main__":
    main()
