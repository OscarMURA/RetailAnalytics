"""Shared global filter parsing → SQL WHERE fragments + bind params.

All data endpoints accept optional:
  stores : csv of store ids (absent = all)
  from   : YYYY-MM-DD inclusive lower bound
  to     : YYYY-MM-DD inclusive upper bound
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Filters:
    stores: list[str]
    date_from: str | None
    date_to: str | None

    def where(self, date_col: str = "date", store_col: str = "store_id") -> tuple[str, list]:
        clauses: list[str] = []
        params: list = []
        if self.stores:
            placeholders = ",".join(["?"] * len(self.stores))
            clauses.append(f"{store_col} IN ({placeholders})")
            params.extend(self.stores)
        if self.date_from:
            clauses.append(f"{date_col} >= ?")
            params.append(self.date_from)
        if self.date_to:
            clauses.append(f"{date_col} <= ?")
            params.append(self.date_to)
        sql = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        return sql, params


def parse_filters(stores: str | None, date_from: str | None, date_to: str | None) -> Filters:
    store_list = [s.strip() for s in stores.split(",") if s.strip()] if stores else []
    return Filters(stores=store_list, date_from=date_from or None, date_to=date_to or None)
