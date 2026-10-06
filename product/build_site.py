# -*- coding: utf-8 -*-
"""
Build the dashboard data from data/raw, using the same analysis module as the notebook.

    python product/build_site.py

Emits
    product/site/data.json            analysis tables + the DSR-gap series (first screen)
    product/site/data-series.json     DSR level, credit/GDP, policy-rate and NPL series
    product/site/vendor/world_110m.json  (only if missing) map topology for offline use

Nothing here re-implements analysis: all numbers come from analysis.core.run_all(),
the function notebooks/01_analysis.ipynb also calls. The site inserts every number
it displays from data.json at run time, so the page cannot drift from data/raw.

Series are stored compactly: {"s": first period, "v": [values]} from the first to the
last valid observation of each series; gaps inside stay null (never filled).
"""

import datetime as dt
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from analysis import core  # noqa: E402

SITE = Path(__file__).resolve().parent / "site"
FOCUS = ["KR", "TH", "MY", "HK"]
TOPOJSON_URL = "https://cdn.plot.ly/un/world_110m.json"


def num(x, d=3):
    if x is None:
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else round(f, d)


def ts(x):
    return None if x is None or pd.isna(x) else pd.Timestamp(x).strftime("%Y-%m-%d")


def compact(s: pd.Series, d: int) -> dict | None:
    valid = s.dropna()
    if valid.empty:
        return None
    win = s.loc[valid.index.min():valid.index.max()]
    return {"s": win.index[0].strftime("%Y-%m-%d"), "v": [num(v, d) for v in win]}


def frame(df: pd.DataFrame, d: int) -> dict:
    out = {}
    for c in df.columns:
        x = compact(df[c], d)
        if x:
            out[c] = x
    return out


def records(df: pd.DataFrame) -> list:
    rows = []
    for r in df.to_dict("records"):
        rec = {}
        for k, v in r.items():
            if isinstance(v, (pd.Timestamp, dt.date)) or (hasattr(v, "year") and not isinstance(v, (int, float))):
                rec[k] = ts(v)
            elif isinstance(v, (bool, np.bool_)):
                rec[k] = bool(v)
            elif v is None or isinstance(v, str):
                rec[k] = v
            elif isinstance(v, (list, tuple)):
                rec[k] = list(v)
            else:
                f = num(v, 4)
                rec[k] = f
        rows.append(rec)
    return rows


def main() -> None:
    R = core.run_all(ROOT / "data")
    T = R.tables
    cty = T["countries"]
    summary = json.loads((ROOT / "data" / "meta" / "fetch_summary.json").read_text(encoding="utf-8"))

    countries = []
    for r in cty.itertuples():
        countries.append({
            "iso2": r.iso2, "iso3": r.iso3, "en": r.name_en, "vi": r.name_vi, "region": r.region,
            "group": r.group, "aggregate": bool(r.is_aggregate), "euro": bool(r.euro_member),
            "euro_since": int(r.euro_since) if r.euro_member else None,
            "policy_code": r.policy_code, "policy_note": r.policy_note, "policy_note_src": r.policy_note_source,
            "has": {b: bool(getattr(r, f"has_dsr_{b}")) for b in "HNP"},
            "first": {k: getattr(r, f"{k}_first") or None for k in ("dsr", "credit", "policy", "npl")},
            "last": {k: getattr(r, f"{k}_last") or None for k in ("dsr", "credit", "policy", "npl")},
        })

    cov = pd.read_csv(ROOT / "data" / "meta" / "coverage.csv")
    cov = cov[cov.period.isin(["1999-latest", "2020-latest"])]
    coverage = {}
    for r in cov.itertuples():
        coverage.setdefault(r.iso2, {}).setdefault(r.series, {})[r.period] = r.pct_missing

    bench = {k: {"mean": num(v["mean"], 3), "start": core.qlabel(v["start"]) if v["start"] is not None else None,
                 "end": core.qlabel(v["end"]) if v["end"] is not None else None, "n": int(v["n_obs"])}
             for k, v in R.bench.iterrows()}

    cycles = {}
    for c, r in R.cycles.iterrows():
        cycles[c] = {"has_cycle": bool(r.has_cycle), "trough": num(r.trough, 4), "trough_date": ts(r.trough_date),
                     "liftoff": ts(r.liftoff), "peak": num(r.peak, 4), "peak_date": ts(r.peak_date),
                     "hike_pp": num(r.hike_pp, 4), "reason": r.reason, "policy_code": r.policy_code}

    lags = R.lags.copy()
    lags = records(lags)

    payload = {
        "meta": {
            "retrieved": summary["retrieved"],
            "summary": summary,
            "focus": FOCUS,
            "cycle_window": list(core.CYCLE_WINDOW),
            "cycle_peak_end": core.CYCLE_PEAK_END,
            "bench_quarters": core.BENCH_QUARTERS,
            "large_hike_pp": core.LARGE_HIKE_PP,
            "freq": {"dsr": "Q", "gap": "Q", "credit": "Q", "policy": "M", "npl": "A"},
            "sources": {
                "dsr": "BIS WS_DSR 1.0", "credit": "BIS WS_TC 2.0 (all lenders, market value, % of GDP, adjusted for breaks)",
                "policy": "BIS WS_CBPOL 1.0 (end of month; euro members = ECB from adoption year)",
                "npl": "World Bank FB.AST.NPER.ZS (annual)",
            },
        },
        "countries": countries,
        "coverage": coverage,
        "series": {
            "dsr": frame(T["dsr"], 2), "gap": frame(R.gap, 3), "credit": frame(T["credit"], 2),
            "policy": frame(T["policy"], 4), "npl": frame(T["npl"], 3),
        },
        "bench": bench,
        "cycles": cycles,
        "lags": lags,
        "lag_dist": json.loads(json.dumps(R.lag_dist, default=lambda o: None)),
        "cross": json.loads(json.dumps(R.cross, default=lambda o: None)),
        "npl_corr": records(R.npl_corr),
        "recovery": records(R.recovery),
    }
    # Two files: everything the first screen needs (headline, KPIs, map, lag, scatter)
    # in data.json; the long level/credit/policy/NPL series in data-series.json, which
    # the page fetches after first paint together with the chart library.
    later = {k: payload["series"].pop(k) for k in ("dsr", "credit", "policy", "npl")}
    dump = lambda obj: json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    (SITE / "data.json").write_text(dump(payload), encoding="utf-8")
    (SITE / "data-series.json").write_text(dump({"series": later}), encoding="utf-8")

    vendor = SITE / "vendor"
    vendor.mkdir(exist_ok=True)
    topo = vendor / "world_110m.json"
    if not topo.exists():
        import requests
        topo.write_bytes(requests.get(TOPOJSON_URL, timeout=60).content)

    sizes = {f: (SITE / f).stat().st_size / 1024 for f in ("data.json", "data-series.json")}
    n_series = sum(len(v) for v in payload["series"].values()) + sum(len(v) for v in later.values())
    print(f"data.json {sizes['data.json']:,.0f} KB + data-series.json {sizes['data-series.json']:,.0f} KB "
          f"= {sum(sizes.values()):,.0f} KB  ({len(countries)} economies, {n_series} series)")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
