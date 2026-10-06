"""
Shared analysis logic for the notebook, the site builder and the tests.

Every number the project reports is computed here exactly once:

    load_tables()          raw CSVs -> wide frames (nothing filled, nothing interpolated)
    mapped_policy()        policy rate actually used for a country (euro members -> ECB)
    benchmark_20y()        each series' own 20-year mean (last 80 quarters available)
    find_liftoff()         first hike after the 2021-2023 policy-rate trough
    measure_lag()          quarters from lift-off to the DSR peak, with censoring flag
    corr_with_ci()         Pearson r with n and a Fisher-z confidence interval
    run_all()              the whole pipeline, returning tidy tables

Conventions
-----------
* Quarterly series are indexed at quarter end, monthly at month end, annual at 31 Dec.
* Missing stays missing (NaN). No function here fills, interpolates or extrapolates.
* Cross-country comparisons use the gap to each series' own 20-year mean, never the
  DSR level: BIS warns that levels are not comparable across countries.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

BORROWERS = ("H", "N", "P")
BORROWER_LABEL = {"H": "Households & NPISHs", "N": "Non-financial corporations",
                  "P": "Private non-financial sector"}
EURO_CODE = "XM"
CYCLE_WINDOW = ("2021-01-01", "2023-12-31")   # where the lift-off must happen
CYCLE_PEAK_END = "2024-12-31"                 # policy-rate peak searched up to here
BENCH_QUARTERS = 80                           # 20 years
NO_RISE_TOL = 0.0                             # DSR must exceed its pre-lift-off level
LARGE_HIKE_PP = 10.0                          # robustness cut for the cross-country scatter


# ============================================================================ dates
def q2d(s: pd.Series) -> pd.DatetimeIndex:
    """'2016-Q1' -> 2016-03-31."""
    return (pd.PeriodIndex(s.astype(str).str.replace("-Q", "Q", regex=False), freq="Q")
            .to_timestamp(how="end").normalize())


def m2d(s: pd.Series) -> pd.DatetimeIndex:
    """'2016-01' -> 2016-01-31."""
    return pd.PeriodIndex(s.astype(str), freq="M").to_timestamp(how="end").normalize()


def qlabel(ts) -> str:
    ts = pd.Timestamp(ts)
    return f"{ts.year}-Q{ts.quarter}"


def period_label(ts, dataset: str) -> str:
    ts = pd.Timestamp(ts)
    if dataset in ("dsr", "credit"):
        return qlabel(ts)
    if dataset in ("policy", "policy_raw"):
        return f"{ts.year}-{ts.month:02d}"
    return str(ts.year)


def quarter_index(ts) -> int:
    ts = pd.Timestamp(ts)
    return ts.year * 4 + (ts.quarter - 1)


# ============================================================================ loading
def _wide(df: pd.DataFrame, cty: str, sub: str | None, dates) -> pd.DataFrame:
    d = df.copy()
    d["date"] = dates(d["TIME_PERIOD"])
    d["series"] = d[cty] + ("_" + d[sub] if sub else "")
    return d.pivot_table(index="date", columns="series", values="OBS_VALUE",
                         aggfunc="first").sort_index()


def bis_to_wb_iso3(codes, wb_meta: pd.DataFrame) -> dict:
    """BIS ISO2 -> World Bank ISO3. WB's ISO2 'XM' is *Low income*, so the euro
    area is mapped explicitly to WB 'EMU'."""
    wb = dict(zip(wb_meta["iso2_wb"], wb_meta["iso3"]))
    out = {}
    for c in codes:
        if c == EURO_CODE:
            out[c] = "EMU"
        elif c in wb:
            out[c] = wb[c]
    return out


def tidy_all(dsr, credit, policy, npl, wb_meta) -> dict:
    """Raw SDMX-CSV / WB frames -> wide frames keyed like 'KR_P' (DSR, credit) or 'KR'."""
    out = {
        "dsr": _wide(dsr, "BORROWERS_CTY", "DSR_BORROWERS", q2d),
        "credit": _wide(credit, "BORROWERS_CTY", "TC_BORROWERS", q2d),
        "policy_raw": _wide(policy, "REF_AREA", None, m2d),
    }
    codes = set(dsr.BORROWERS_CTY) | set(credit.BORROWERS_CTY) | set(policy.REF_AREA)
    iso3_to_bis = {v: k for k, v in bis_to_wb_iso3(codes, wb_meta).items()}
    n = npl.copy()
    n["cty"] = n["countryiso3code"].map(iso3_to_bis)
    n = n.dropna(subset=["cty"])
    w = n.pivot_table(index="date", columns="cty", values="NPL_ratio", aggfunc="first")
    w.index = pd.to_datetime(w.index.astype(int).astype(str) + "-12-31")
    out["npl"] = w.sort_index()
    return out


def load_tables(data_dir: Path | str) -> dict:
    """Read data/raw + data/meta and return every wide frame the analysis needs."""
    data_dir = Path(data_dir)
    raw = data_dir / "raw"
    t = tidy_all(
        pd.read_csv(raw / "dsr.csv", low_memory=False),
        pd.read_csv(raw / "credit_gdp.csv.gz", low_memory=False),
        pd.read_csv(raw / "policy_rate.csv.gz", low_memory=False),
        pd.read_csv(raw / "npl_ratio_worldbank.csv"),
        pd.read_csv(raw / "wb_country_meta.csv", keep_default_na=False),
    )
    countries = pd.read_csv(data_dir / "meta" / "countries.csv", keep_default_na=False)
    for col in [c for c in countries.columns if c.startswith(("has_", "is_", "euro_member"))]:
        countries[col] = countries[col].astype(str).eq("True")
    t["countries"] = countries
    t["euro_since"] = {r.iso2: int(r.euro_since) for r in countries.itertuples() if r.euro_member}
    t["policy"] = pd.DataFrame({c: mapped_policy(c, t["policy_raw"], t["euro_since"])
                                for c in countries.iso2})
    return t


# ============================================================================ policy mapping
def policy_code_for(cty: str, euro_since: dict, policy_cols) -> tuple[str, str]:
    """(code used, national code used before euro adoption or '')."""
    if cty in euro_since:
        return EURO_CODE, (cty if cty in policy_cols else "")
    return (cty if cty in policy_cols else ""), ""


def mapped_policy(cty: str, policy_raw: pd.DataFrame, euro_since: dict) -> pd.Series:
    """Policy rate that actually applied to `cty`.

    Euro members: their national rate until December of the year before adoption,
    the ECB rate (BIS 'XM') from January of the adoption year. Everyone else: own
    series. No series -> all-NaN, never a borrowed proxy.
    """
    idx = policy_raw.index
    if cty in euro_since:
        cut = pd.Timestamp(f"{euro_since[cty]}-01-01")
        nat = policy_raw[cty] if cty in policy_raw else pd.Series(np.nan, index=idx)
        ecb = policy_raw[EURO_CODE] if EURO_CODE in policy_raw else pd.Series(np.nan, index=idx)
        s = nat.where(idx < cut, ecb)
    elif cty in policy_raw:
        s = policy_raw[cty]
    else:
        s = pd.Series(np.nan, index=idx)
    return s.rename(cty)


# ============================================================================ 20-year benchmark
def benchmark_20y(series: pd.Series, n_quarters: int = BENCH_QUARTERS) -> dict:
    """Mean of the last `n_quarters` quarters up to the series' last observation."""
    s = series.dropna()
    if s.empty:
        return {"mean": np.nan, "start": None, "end": None, "n_obs": 0, "complete": False}
    end = s.index.max()
    start = (pd.Period(end, freq="Q") - (n_quarters - 1)).to_timestamp(how="end").normalize()
    win = series.loc[start:end]
    return {"mean": float(win.mean()), "start": start, "end": end,
            "n_obs": int(win.notna().sum()), "complete": bool(win.notna().sum() == n_quarters)}


def gap_vs_benchmark(dsr: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(gap frame in pp, benchmark table). Gap = level - own 20-year mean."""
    bench = {c: benchmark_20y(dsr[c]) for c in dsr.columns}
    means = pd.Series({c: b["mean"] for c, b in bench.items()})
    tbl = pd.DataFrame(bench).T
    tbl.index.name = "series"
    return dsr - means, tbl


# ============================================================================ lift-off
def find_liftoff(policy: pd.Series, window=CYCLE_WINDOW, peak_end=CYCLE_PEAK_END) -> dict:
    """First policy-rate increase after the trough inside `window`.

    trough   = earliest month at which the rate hits its minimum inside the window
    lift-off = first later month (still inside the window) with a rate above that minimum
    peak     = highest rate from lift-off up to `peak_end`

    Returns has_cycle=False when the rate never rises after its trough inside the window
    (e.g. it only cut, or stayed flat); such economies are excluded from the lag analysis.
    """
    s = policy.loc[window[0]:window[1]].dropna()
    out = {"has_cycle": False, "trough_date": None, "trough": np.nan, "liftoff": None,
           "peak_date": None, "peak": np.nan, "hike_pp": np.nan, "reason": ""}
    if len(s) < 2:
        out["reason"] = "no policy-rate data in 2021-2023"
        return out
    trough_val = float(s.min())
    trough_date = s.index[s.eq(trough_val)][0]
    after = s.loc[trough_date:]
    rises = after[after > trough_val + 1e-9]
    out.update(trough=trough_val, trough_date=trough_date)
    if rises.empty:
        out["reason"] = "no hike after the 2021-2023 trough"
        return out
    lift = rises.index[0]
    tail = policy.loc[lift:peak_end].dropna()
    out.update(has_cycle=True, liftoff=lift, peak_date=tail.idxmax(), peak=float(tail.max()),
               hike_pp=float(tail.max() - trough_val))
    return out


# ============================================================================ lag
def measure_lag(dsr: pd.Series, liftoff) -> dict:
    """Quarters from the lift-off quarter to the highest DSR at or after it.

    base     = last DSR observation before the lift-off quarter
    peak     = first quarter with the maximum DSR from the lift-off quarter onwards
    censored = the peak is the last observation in the sample: the true peak may be later,
               so the lag is only a lower bound
    no_rise  = no transmission peak to time: DSR never exceeded its pre-lift-off level, or
               its maximum is the lift-off quarter itself (it only fell after the hike)

    Precision is +/-1 quarter: lift-off is monthly, DSR is a quarterly ratio.
    """
    s = dsr.dropna()
    out = {"ok": False, "liftoff_q": None, "base": np.nan, "peak_q": None, "peak": np.nan,
           "lag_q": np.nan, "rise_pp": np.nan, "censored": False, "no_rise": False,
           "last_q": None}
    if s.empty or liftoff is None:
        return out
    lift_q_end = pd.Period(pd.Timestamp(liftoff), freq="Q").to_timestamp(how="end").normalize()
    before = s[s.index < lift_q_end]          # quarter ends strictly before the lift-off quarter
    post = s[s.index >= lift_q_end]
    if before.empty or post.empty:
        return out
    base = float(before.iloc[-1])
    pk_date = post.idxmax()
    pk = float(post.max())
    out.update(ok=True, liftoff_q=lift_q_end, base=base, peak_q=pk_date, peak=pk,
               lag_q=quarter_index(pk_date) - quarter_index(lift_q_end),
               rise_pp=pk - base, last_q=s.index.max())
    out["no_rise"] = bool(pk - base <= NO_RISE_TOL or pk_date == lift_q_end)
    out["censored"] = bool(pk_date == s.index.max() and not out["no_rise"])
    return out


def lag_distribution(lags) -> dict:
    a = np.asarray([x for x in lags if pd.notna(x)], dtype=float)
    if a.size == 0:
        return {"n": 0, "median": np.nan, "q1": np.nan, "q3": np.nan, "min": np.nan, "max": np.nan}
    q1, med, q3 = np.percentile(a, [25, 50, 75])
    return {"n": int(a.size), "median": float(med), "q1": float(q1), "q3": float(q3),
            "min": float(a.min()), "max": float(a.max())}


def km_median(durations, censored) -> float:
    """Kaplan-Meier median of right-censored durations (NaN if survival never <= 0.5)."""
    d = np.asarray(durations, dtype=float)
    c = np.asarray(censored, dtype=bool)
    surv = 1.0
    for t in np.unique(d):
        at_risk = (d >= t).sum()
        events = ((d == t) & ~c).sum()
        if at_risk and events:
            surv *= 1 - events / at_risk
            if surv <= 0.5:
                return float(t)
    return float("nan")


# ============================================================================ correlation
def fisher_ci(r: float, n: int, conf: float = 0.95) -> tuple[float, float]:
    """Fisher z interval for a correlation; NaN when n < 4 or |r| = 1."""
    if n < 4 or not np.isfinite(r) or abs(r) >= 1:
        return (np.nan, np.nan)
    from statistics import NormalDist
    z = math.atanh(r)
    se = 1 / math.sqrt(n - 3)
    k = NormalDist().inv_cdf(0.5 + conf / 2)
    return (math.tanh(z - k * se), math.tanh(z + k * se))


def corr_with_ci(x, y, method: str = "pearson") -> dict:
    """Correlation on pairwise-complete observations, with n and a 95% Fisher-z CI.
    For Spearman the Fisher interval is an approximation."""
    j = pd.concat([pd.Series(x).reset_index(drop=True), pd.Series(y).reset_index(drop=True)],
                  axis=1).dropna()
    n = len(j)
    if n < 3 or j.iloc[:, 0].nunique() < 2 or j.iloc[:, 1].nunique() < 2:
        return {"r": np.nan, "n": n, "lo": np.nan, "hi": np.nan}
    r = float(j.iloc[:, 0].corr(j.iloc[:, 1], method=method))
    lo, hi = fisher_ci(r, n)
    return {"r": r, "n": n, "lo": lo, "hi": hi}


# ============================================================================ coverage
PERIODS = [("1999-2009", "1999-01-01", "2009-12-31"),
           ("2010-2019", "2010-01-01", "2019-12-31"),
           ("2020-latest", "2020-01-01", None),
           ("1999-latest", "1999-01-01", None)]


def coverage_table(t: dict) -> pd.DataFrame:
    """% of expected observations missing, by economy x series x period.

    'Expected' runs to the latest period any economy has in that dataset, so a series
    that stops early or never existed shows up as missing instead of disappearing.
    """
    specs = [(f"dsr_{b}", t["dsr"], lambda c, b=b: f"{c}_{b}", "QE") for b in BORROWERS]
    specs += [(f"credit_{b}", t["credit"], lambda c, b=b: f"{c}_{b}", "QE") for b in BORROWERS]
    specs += [("policy", t["policy"], lambda c: c, "ME"), ("npl", t["npl"], lambda c: c, "YE")]
    rows = []
    for name, frame, col, freq in specs:
        last = frame.dropna(how="all").index.max()
        for label, a, b in PERIODS:
            end = pd.Timestamp(b) if b else last
            expected = pd.date_range(a, end, freq=freq)
            for c in t["countries"].iso2:
                s = frame[col(c)] if col(c) in frame else pd.Series(dtype=float)
                valid = int(s.reindex(expected).notna().sum())
                rows.append({"iso2": c, "series": name, "period": label,
                             "period_end": period_label(end, name.split("_")[0]),
                             "n_expected": len(expected), "n_valid": valid,
                             "pct_missing": round(100 * (1 - valid / len(expected)), 1)})
    return pd.DataFrame(rows)


# ============================================================================ pipeline
@dataclass
class Results:
    tables: dict
    gap: pd.DataFrame
    bench: pd.DataFrame
    cycles: pd.DataFrame
    lags: pd.DataFrame
    lag_dist: dict
    npl_corr: pd.DataFrame
    cross: dict
    recovery: pd.DataFrame


def annual_q4(df: pd.DataFrame) -> pd.DataFrame:
    """Q4 value as the year-end observation (BIS series are end-of-period)."""
    a = df[df.index.month == 12].copy()
    a.index = pd.to_datetime(a.index.year.astype(str) + "-12-31")
    return a


def run_all(data_dir: Path | str) -> Results:
    t = load_tables(data_dir)
    dsr, policy, npl = t["dsr"], t["policy"], t["npl"]
    countries = t["countries"].set_index("iso2")
    gap, bench = gap_vs_benchmark(dsr)

    # ---- policy cycles
    cyc = []
    for c in countries.index:
        r = find_liftoff(policy[c])
        r.update(iso2=c, policy_code=countries.loc[c, "policy_code"])
        cyc.append(r)
    cycles = pd.DataFrame(cyc).set_index("iso2")

    # ---- lags, all series with DSR
    lag_rows = []
    for col in dsr.columns:
        c, b = col.split("_")
        if c not in cycles.index:
            continue
        cy = cycles.loc[c]
        rec = {"series": col, "iso2": c, "borrower": b, "has_cycle": bool(cy.has_cycle),
               "liftoff": cy.liftoff, "hike_pp": cy.hike_pp}
        if cy.has_cycle:
            m = measure_lag(dsr[col], cy.liftoff)
            rec.update({k: m[k] for k in ("liftoff_q", "base", "peak_q", "peak", "lag_q",
                                           "rise_pp", "censored", "no_rise", "last_q")})
            rec["peak_gap"] = m["peak"] - bench.loc[col, "mean"] if m["ok"] else np.nan
        lag_rows.append(rec)
    lags = pd.DataFrame(lag_rows)
    for col in ("censored", "no_rise"):
        lags[col] = lags[col].eq(True)

    usable = lags[lags.has_cycle & lags.lag_q.notna() & ~lags.no_rise]
    dist = {}
    for b in BORROWERS:
        u = usable[usable.borrower == b]
        dist[b] = {
            "uncensored": lag_distribution(u.loc[~u.censored, "lag_q"]),
            "all_lower_bound": lag_distribution(u["lag_q"]),
            "km_median": km_median(u["lag_q"], u["censored"]) if len(u) else np.nan,
            "n_censored": int(u.censored.sum()),
            "n_no_rise": int((lags.has_cycle & lags.no_rise & (lags.borrower == b)).sum()),
            "n_no_cycle": int((~lags.has_cycle & (lags.borrower == b)).sum()),
        }

    # ---- NPL vs DSR (annual, Q4), descriptive
    dsr_a = annual_q4(dsr)
    nrows = []
    for c in countries.index:
        col = f"{c}_P"
        if col not in dsr_a or c not in npl:
            continue
        x, y = dsr_a[col], npl[c]
        j = pd.concat([x.rename("dsr"), y.rename("npl")], axis=1).dropna()
        lv = corr_with_ci(j.dsr, j.npl)
        df_ = corr_with_ci(j.dsr.diff(), j.npl.diff())
        nrows.append({"iso2": c, "years": f"{j.index.min().year}-{j.index.max().year}" if len(j) else "",
                      "r_level": lv["r"], "n_level": lv["n"], "lo_level": lv["lo"], "hi_level": lv["hi"],
                      "r_change": df_["r"], "n_change": df_["n"], "lo_change": df_["lo"], "hi_change": df_["hi"],
                      "npl_last_year": int(y.last_valid_index().year) if y.notna().any() else None})
    npl_corr = pd.DataFrame(nrows)

    # ---- cross-country: hike size vs DSR rise / lag (P series, economies with a cycle)
    p = usable[usable.borrower == "P"]
    small = p[p.hike_pp <= LARGE_HIKE_PP]
    cross = {
        # Robustness: drop very large hiking cycles (high-inflation economies), which
        # dominate a Pearson coefficient on n of about 20.
        "hike_vs_rise_small": {**corr_with_ci(small.hike_pp, small.rise_pp),
                               "excluded": sorted(set(p.iso2) - set(small.iso2)),
                               "threshold_pp": LARGE_HIKE_PP},
        "hike_vs_rise": {**corr_with_ci(p.hike_pp, p.rise_pp),
                         "spearman": corr_with_ci(p.hike_pp, p.rise_pp, "spearman")["r"]},
        "hike_vs_lag": {**corr_with_ci(p.loc[~p.censored, "hike_pp"], p.loc[~p.censored, "lag_q"]),
                        "spearman": corr_with_ci(p.loc[~p.censored, "hike_pp"],
                                                 p.loc[~p.censored, "lag_q"], "spearman")["r"]},
    }

    # ---- recovery: where is each series now relative to its own 20-year mean?
    rec = []
    for _, r in lags.iterrows():
        col = r.series
        s = dsr[col].dropna()
        g_now = float(gap[col].dropna().iloc[-1])
        g_peak = float(r.peak_gap) if r.has_cycle and pd.notna(r.get("peak_gap")) else np.nan
        unwound = ((g_peak - g_now) / g_peak * 100) if (pd.notna(g_peak) and g_peak >= 0.5) else np.nan
        rec.append({"series": col, "iso2": r.iso2, "borrower": r.borrower, "latest_q": qlabel(s.index.max()),
                    "latest": float(s.iloc[-1]), "bench": float(bench.loc[col, "mean"]),
                    "gap_now": g_now, "gap_peak": g_peak, "unwound_pct": unwound})
    recovery = pd.DataFrame(rec)

    return Results(t, gap, bench, cycles, lags, dist, npl_corr, cross, recovery)
