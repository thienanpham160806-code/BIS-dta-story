# -*- coding: utf-8 -*-
"""
Build the localhost dashboard in product/site/.

Reads data/raw, recomputes every derived metric the story uses (same logic as
notebooks/01_analysis.ipynb), and emits:

    product/site/data.json            - all series + all analysis tables
    product/site/vendor/plotly.min.js - vendored from the installed plotly package
                                        so the site runs fully offline

Run:  python product/build_site.py
Then: python product/serve.py
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
SITE = Path(__file__).resolve().parent / "site"
(SITE / "vendor").mkdir(parents=True, exist_ok=True)

ORDER = ["KR", "TH", "MY", "HK"]
CTY = {"KR": "Hàn Quốc", "TH": "Thái Lan", "MY": "Malaysia",
       "HK": "Hong Kong SAR", "US": "Mỹ (Fed)"}
# Categorical slots assigned in fixed order; colour follows the country, never its rank.
COLOR = {"KR": "#2a78d6", "TH": "#eb6834", "MY": "#1baf7a", "HK": "#eda100", "US": "#52514e"}
COLOR_DARK = {"KR": "#3987e5", "TH": "#d95926", "MY": "#199e70", "HK": "#c98500", "US": "#c3c2b7"}
BORROWER = {"H": "Hộ gia đình", "N": "Doanh nghiệp", "P": "Tư nhân phi tài chính (PNFS)"}


def q2d(s):
    return pd.PeriodIndex(s.str.replace("-Q", "Q", regex=False), freq="Q").to_timestamp(how="end").normalize()


def m2d(s):
    return pd.PeriodIndex(s, freq="M").to_timestamp(how="end").normalize()


# ----------------------------------------------------------------- load & pivot
dsr_raw = pd.read_csv(RAW / "dsr.csv")
dsr_raw["date"] = q2d(dsr_raw["TIME_PERIOD"])
dsr_raw["series"] = dsr_raw["BORROWERS_CTY"] + "_" + dsr_raw["DSR_BORROWERS"]
DSR = dsr_raw.pivot(index="date", columns="series", values="OBS_VALUE").sort_index()

lr = pd.read_csv(RAW / "dsr_longrun.csv")
lr["date"] = q2d(lr["TIME_PERIOD"])
lr["series"] = lr["BORROWERS_CTY"] + "_" + lr["DSR_BORROWERS"]
DSR_LONG = lr.pivot(index="date", columns="series", values="OBS_VALUE").sort_index()

cr = pd.read_csv(RAW / "credit_gdp.csv")
cr["date"] = q2d(cr["TIME_PERIOD"])
cr["series"] = cr["BORROWERS_CTY"] + "_" + cr["TC_BORROWERS"]
CREDIT = cr.pivot(index="date", columns="series", values="OBS_VALUE").sort_index()

po = pd.read_csv(RAW / "policy_rate.csv")
po["date"] = m2d(po["TIME_PERIOD"])
POLICY = po.pivot(index="date", columns="REF_AREA", values="OBS_VALUE").sort_index()
POLICY_Q = POLICY.resample("QE").last()

ISO = {"KOR": "KR", "THA": "TH", "MYS": "MY", "HKG": "HK"}
npl_raw = pd.read_csv(RAW / "npl_ratio_worldbank.csv")
npl_raw["cty"] = npl_raw["countryiso3code"].map(ISO)
NPL = npl_raw.pivot(index="date", columns="cty", values="NPL_ratio").sort_index()
NPL.index = pd.to_datetime(NPL.index.astype(str) + "-12-31")
NPL = NPL[ORDER]

# 20-year benchmark: BIS recommends comparing DSR to a country's own history,
# never to another country's level.
BENCH = DSR_LONG.loc["2006-01-01":"2025-12-31"].mean()
DSR_GAP = DSR - BENCH
DSR_A = DSR[DSR.index.month == 12]

HAS_BREAKDOWN = [c for c in ORDER if {f"{c}_H", f"{c}_N"} <= set(DSR.columns)]


def jsonify(df):
    """Wide frame -> {dates: [...], cols: {name: [values, None where missing]}}."""
    return {
        "dates": [d.strftime("%Y-%m-%d") for d in df.index],
        "cols": {c: [None if pd.isna(v) else round(float(v), 4) for v in df[c]]
                 for c in df.columns},
    }


# ----------------------------------------------------------------- policy cycle
def find_cycle(c):
    s = POLICY[c].loc["2021-01-31":"2024-12-31"]
    tv = s.loc[:"2022-12-31"].min()
    t = s.loc[:"2022-12-31"].idxmin()
    after = s.loc[t:]
    start = after[after > tv + 1e-9].index.min()
    return dict(trough=float(tv), start=start, peak=s.idxmax(), peak_val=float(s.max()))


CYCLE = {c: find_cycle(c) for c in ORDER + ["US"]}

cycle_rows = [{
    "cty": c, "name": CTY[c],
    "trough": CYCLE[c]["trough"],
    "start": CYCLE[c]["start"].strftime("%m/%Y"),
    "peak": CYCLE[c]["peak_val"],
    "peak_when": CYCLE[c]["peak"].strftime("%m/%Y"),
    "total_hike": round(CYCLE[c]["peak_val"] - CYCLE[c]["trough"], 2),
    "now": float(POLICY[c].iloc[-1]),
    "cut": round(float(POLICY[c].iloc[-1]) - CYCLE[c]["peak_val"], 2),
} for c in ORDER + ["US"]]

# ----------------------------------------------------------------- lag test
PAIRS = [("KR", "KR_P"), ("KR", "KR_H"), ("KR", "KR_N"),
         ("TH", "TH_P"), ("MY", "MY_P"), ("HK", "HK_P")]
LABEL = {"KR_P": "Hàn Quốc — PNFS", "KR_H": "Hàn Quốc — Hộ gia đình",
         "KR_N": "Hàn Quốc — Doanh nghiệp", "TH_P": "Thái Lan — PNFS",
         "MY_P": "Malaysia — PNFS", "HK_P": "Hong Kong — PNFS"}

lag_rows = []
for cty, ser in PAIRS:
    start = CYCLE[cty]["start"]
    post = DSR[ser].loc[start:]
    pk, pv = post.idxmax(), float(post.max())
    lag = (pk.year - start.year) * 12 + (pk.month - start.month)
    base = float(DSR[ser].asof(start))
    lag_rows.append({
        "cty": cty, "series": ser, "label": LABEL[ser],
        "start": start.strftime("%m/%Y"), "base": base,
        "peak": pv, "peak_q": f"{pk.year}-Q{pk.quarter}",
        "lag_months": int(lag), "rise": round(pv - base, 1),
        "fits": bool(12 <= lag <= 18),
    })

LAGS = list(range(9))
corr_rows = []
for cty, ser in PAIRS:
    dp, dd = POLICY_Q[cty].diff(), DSR[ser].diff()
    vals = [round(float(dp.shift(L).corr(dd)), 3) for L in LAGS]
    best = int(np.argmax(vals))
    corr_rows.append({"cty": cty, "series": ser, "label": LABEL[ser],
                      "values": vals, "best": best, "best_r": vals[best]})

# ----------------------------------------------------------------- surprise test
BASE_Q = pd.Timestamp("2021-12-31")
surprise_rows = []
for c in ORDER:
    ser = f"{c}_P"
    pk = DSR[ser].loc["2022-03-31":].idxmax()
    d0, d1 = float(DSR[ser].loc[BASE_Q]), float(DSR[ser].loc[pk])
    c0, c1 = float(CREDIT[ser].loc[BASE_Q]), float(CREDIT[ser].loc[pk])
    surprise_rows.append({
        "cty": c, "name": CTY[c], "peak_q": f"{pk.year}-Q{pk.quarter}",
        "dsr0": d0, "dsr1": d1, "d_dsr": round(d1 - d0, 1),
        "cr0": c0, "cr1": c1, "d_credit": round(c1 - c0, 1),
        "fits": bool(d1 - d0 > 0 and c1 - c0 < 0),
    })

# ----------------------------------------------------------------- NPL cross-check
cross_rows = []
for c in ORDER:
    j = pd.concat([DSR_A[f"{c}_P"].rename("dsr"), NPL[c].rename("npl")], axis=1).dropna()
    dj = j.diff().dropna()
    last = NPL[c].last_valid_index()
    n21, nl = float(NPL[c].loc["2021-12-31"]), float(NPL[c].loc[last])
    d_npl = round(nl - n21, 2)
    cross_rows.append({
        "cty": c, "name": CTY[c], "n": int(len(j)),
        "corr_level": round(float(j.dsr.corr(j.npl)), 2),
        "corr_diff": round(float(dj.dsr.corr(dj.npl)), 2),
        "d_dsr": round(float(DSR[f"{c}_P"].loc["2022-03-31":].max() - DSR[f"{c}_P"].loc[BASE_Q]), 1),
        "npl21": round(n21, 2), "npl_last": round(nl, 2), "last_year": int(last.year),
        "d_npl": d_npl,
        # A +0.03pp move on a 0.23 base is noise; say so rather than let a bare
        # "yes" imply a transmission the magnitude does not support.
        "verdict": "KHÔNG" if d_npl <= 0 else ("CÓ" if d_npl >= 0.10 else "không đáng kể"),
        "missing": [int(y) for y in range(2016, 2026)
                    if pd.Timestamp(f"{y}-12-31") not in NPL[c].dropna().index],
    })

# ----------------------------------------------------------------- recovery
rec_rows = []
for cty, ser in PAIRS:
    pk = float(DSR[ser].loc["2022-03-31":].max())
    last = float(DSR[ser].iloc[-1])
    b = float(BENCH[ser])
    excess = pk - b
    rec_rows.append({
        "cty": cty, "series": ser, "label": LABEL[ser],
        "peak": pk, "now": last, "bench": round(b, 2),
        "from_peak": round(last - pk, 1), "above_bench": round(last - b, 1),
        # Only meaningful when the cycle actually pushed DSR clear of the benchmark;
        # Malaysia never did, and "gỡ 0%" would read as "recovered nothing" instead of
        # "there was nothing to recover".
        "repaid": round((pk - last) / excess * 100) if excess >= 0.5 else None,
        "never_exceeded": bool(excess < 0.5),
    })
rec_rows.sort(key=lambda r: -r["above_bench"])

# ----------------------------------------------------------------- coverage
coverage = []
for name, df, freq in [("DSR", DSR, "Quý"), ("Credit/GDP", CREDIT, "Quý"),
                       ("Policy rate", POLICY, "Tháng"), ("NPL", NPL, "Năm")]:
    for col in df.columns:
        coverage.append({"dataset": name, "series": col, "freq": freq,
                         "n": int(len(df)), "valid": int(df[col].notna().sum()),
                         "missing_pct": round(float(df[col].isna().mean() * 100), 1)})

# ----------------------------------------------------------------- emit
payload = {
    "meta": {
        "order": ORDER, "names": CTY, "color": COLOR, "color_dark": COLOR_DARK,
        "borrower": BORROWER, "has_breakdown": HAS_BREAKDOWN,
        "window": {"start": "2016-01-01", "end": "2025-12-31"},
        "bench_window": "2006-Q1 → 2025-Q4",
        "phases": {
            "hike": ["2022-03-01", "2023-07-31"],
            "ease": ["2024-09-01", "2025-12-31"],
            "risk": ["2026-01-01", "2026-09-30"],
        },
        "source": "BIS SDMX v2 (WS_DSR 1.0, WS_TC 2.0, WS_CBPOL 1.0) + World Bank FB.AST.NPER.ZS",
    },
    "bench": {k: round(float(v), 2) for k, v in BENCH.items()},
    "series": {
        "dsr": jsonify(DSR), "dsr_gap": jsonify(DSR_GAP), "credit": jsonify(CREDIT),
        "policy": jsonify(POLICY), "npl": jsonify(NPL),
    },
    "tables": {
        "cycle": cycle_rows, "lag": lag_rows, "corr": corr_rows,
        "surprise": surprise_rows, "cross": cross_rows, "recovery": rec_rows,
        "coverage": coverage,
    },
}

(SITE / "data.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

# Vendor plotly.js out of the installed package so the page needs no network.
import plotly.offline as pyo

(SITE / "vendor" / "plotly.min.js").write_text(pyo.get_plotlyjs(), encoding="utf-8")

print(f"data.json            {(SITE / 'data.json').stat().st_size / 1024:>7.0f} KB")
print(f"vendor/plotly.min.js {(SITE / 'vendor' / 'plotly.min.js').stat().st_size / 1024:>7.0f} KB")
print("series:", {k: len(v["cols"]) for k, v in payload["series"].items()})
print("tables:", {k: len(v) for k, v in payload["tables"].items()})
