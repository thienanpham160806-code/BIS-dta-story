"""Unit tests for analysis/core.py on synthetic series with known answers."""

import math
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from analysis import core

ROOT = Path(__file__).resolve().parent.parent


# ----------------------------------------------------------------------------- helpers
def monthly(start, values):
    idx = pd.date_range(start, periods=len(values), freq="ME")
    return pd.Series(values, index=idx, dtype=float)


def quarterly(start, values):
    idx = pd.date_range(start, periods=len(values), freq="QE")
    return pd.Series(values, index=idx, dtype=float)


def steps(*pairs):
    """steps((n, v), ...) -> list with v repeated n times."""
    out = []
    for n, v in pairs:
        out += [v] * n
    return out


# ============================================================================ lift-off
class TestFindLiftoff:
    def test_flat_then_hike(self):
        # 2020-01..2021-12 at 0.5, hike to 0.75 in 2022-03, then up to 2.0
        s = monthly("2020-01-31", steps((26, 0.5), (3, 0.75), (6, 1.5), (24, 2.0)))
        r = core.find_liftoff(s)
        assert r["has_cycle"]
        assert r["liftoff"] == pd.Timestamp("2022-03-31")
        assert r["trough"] == 0.5
        assert r["trough_date"] == pd.Timestamp("2021-01-31")   # earliest month at the minimum
        assert r["peak"] == 2.0
        assert r["hike_pp"] == pytest.approx(1.5)

    def test_trough_late_in_window(self):
        # Türkiye-like: high rate, cut to 8.5 in 2023-02, hike in 2023-06.
        vals = steps((24, 19.0), (12, 14.0), (1, 9.0), (4, 8.5), (19, 15.0))
        s = monthly("2020-01-31", vals)
        r = core.find_liftoff(s)
        assert r["has_cycle"]
        assert r["trough"] == 8.5
        assert r["trough_date"] == pd.Timestamp("2023-02-28")
        assert r["liftoff"] == pd.Timestamp("2023-06-30")

    def test_only_cuts_is_no_cycle(self):
        s = monthly("2020-01-31", np.linspace(4.0, 3.0, 60))
        r = core.find_liftoff(s)
        assert not r["has_cycle"]
        assert r["liftoff"] is None
        assert "no hike" in r["reason"]

    def test_flat_is_no_cycle(self):
        s = monthly("2020-01-31", [-0.1] * 60)          # Japan-like
        assert not core.find_liftoff(s)["has_cycle"]

    def test_hike_after_window_is_no_cycle(self):
        # Flat through 2023, first hike in 2024-03: outside the 2021-2023 window.
        s = monthly("2020-01-31", steps((50, -0.1), (10, 0.1)))
        assert s.index[50] == pd.Timestamp("2024-03-31")
        assert not core.find_liftoff(s)["has_cycle"]

    def test_hike_before_dip_uses_first_trough(self):
        # Minimum reached twice; lift-off is the first rise after the FIRST time.
        vals = steps((14, 1.0), (4, 0.5), (3, 0.75), (3, 0.5), (36, 2.0))
        s = monthly("2020-01-31", vals)
        r = core.find_liftoff(s)
        assert r["trough_date"] == pd.Timestamp("2021-03-31")
        assert r["liftoff"] == pd.Timestamp("2021-07-31")

    def test_no_data(self):
        s = monthly("2010-01-31", [1.0] * 24)
        r = core.find_liftoff(s)
        assert not r["has_cycle"]
        assert "no policy-rate data" in r["reason"]

    def test_missing_months_are_not_filled(self):
        s = monthly("2020-01-31", steps((26, 0.5), (34, 1.0)))
        s.iloc[20:26] = np.nan                         # gap right before the hike
        r = core.find_liftoff(s)
        assert r["liftoff"] == pd.Timestamp("2022-03-31")


# ============================================================================ lag + censoring
class TestMeasureLag:
    def test_known_lag(self):
        # quarters 2020-Q1..2025-Q4 (index 8 = 2022-Q1); DSR rises from 2022-Q2, peaks 2023-Q3
        vals = [10.0] * 9 + [10.2, 10.4, 10.6, 10.8, 11.0, 11.2] + [10.5] * 9
        s = quarterly("2020-03-31", vals)
        assert s.idxmax() == pd.Timestamp("2023-09-30")
        m = core.measure_lag(s, pd.Timestamp("2022-02-28"))   # lift-off Feb -> 2022-Q1
        assert m["liftoff_q"] == pd.Timestamp("2022-03-31")
        assert m["base"] == 10.0                               # 2021-Q4
        assert m["peak_q"] == pd.Timestamp("2023-09-30")
        assert m["lag_q"] == 6
        assert m["rise_pp"] == pytest.approx(1.2)
        assert not m["censored"] and not m["no_rise"]

    def test_censored_when_peak_is_last_observation(self):
        s = quarterly("2020-03-31", [10.0] * 9 + list(np.linspace(10.1, 12.0, 15)))
        m = core.measure_lag(s, pd.Timestamp("2022-03-31"))
        assert m["peak_q"] == s.index[-1]
        assert m["censored"]
        assert m["lag_q"] == core.quarter_index(s.index[-1]) - core.quarter_index("2022-03-31")

    def test_censoring_uses_last_valid_observation(self):
        vals = [10.0] * 9 + list(np.linspace(10.1, 12.0, 13)) + [np.nan, np.nan]
        s = quarterly("2020-03-31", vals)
        m = core.measure_lag(s, pd.Timestamp("2022-03-31"))
        assert m["censored"]
        assert m["peak_q"] == s.dropna().index[-1]

    def test_no_rise_when_dsr_only_falls(self):
        s = quarterly("2020-03-31", np.linspace(15, 12, 24))
        m = core.measure_lag(s, pd.Timestamp("2022-05-31"))
        assert m["no_rise"]
        assert not m["censored"]

    def test_peak_in_liftoff_quarter_is_no_rise(self):
        vals = [10.0] * 8 + [10.3] + list(np.linspace(10.2, 9.0, 15))   # 10.3 = 2022-Q1
        s = quarterly("2020-03-31", vals)
        m = core.measure_lag(s, pd.Timestamp("2022-03-31"))
        assert m["lag_q"] == 0
        assert m["no_rise"]

    def test_first_of_tied_peaks(self):
        vals = [10.0] * 9 + [10.5, 11.0, 11.0, 11.0, 10.0] + [9.0] * 10
        s = quarterly("2020-03-31", vals)
        m = core.measure_lag(s, pd.Timestamp("2022-01-31"))
        assert m["peak_q"] == pd.Timestamp("2022-09-30")
        assert m["lag_q"] == 2

    def test_lag_distribution_and_km(self):
        d = core.lag_distribution([4, 6, 8, np.nan, 10])
        assert d["n"] == 4 and d["median"] == 7.0 and d["q1"] == 5.5 and d["q3"] == 8.5
        # no censoring: KM median equals the lower median of the observed durations
        assert core.km_median([4, 6, 8, 10], [False] * 4) == 6
        # one event out of four: survival only falls to 0.75, so the median is undefined
        assert math.isnan(core.km_median([4, 6, 8, 10], [False, True, True, True]))
        # censoring at 6 removes it from the risk set: S(4)=0.75, S(8)=0.75*(1-1/2)=0.375
        assert core.km_median([4, 6, 8, 10], [False, True, False, False]) == 8


# ============================================================================ euro-area mapping
class TestEuroMapping:
    @pytest.fixture
    def policy_raw(self):
        idx = pd.date_range("1997-01-31", "2024-12-31", freq="ME")
        de = pd.Series(np.where(idx < "1999-01-01", 3.0, np.nan), index=idx)   # national, ends 1998
        xm = pd.Series(np.where(idx >= "1999-01-01", 2.0, np.nan), index=idx)  # ECB from 1999
        hr = pd.Series(np.where(idx < "2023-01-01", 5.0, np.nan), index=idx)
        us = pd.Series(1.0, index=idx)
        return pd.DataFrame({"DE": de, "XM": xm, "HR": hr, "US": us})

    def test_founder_switches_in_1999(self, policy_raw):
        s = core.mapped_policy("DE", policy_raw, {"DE": 1999})
        assert s.loc["1998-12-31"] == 3.0
        assert s.loc["1999-01-31"] == 2.0
        assert s.loc["2022-07-31"] == 2.0

    def test_late_joiner_uses_national_until_adoption(self, policy_raw):
        s = core.mapped_policy("HR", policy_raw, {"HR": 2023})
        assert s.loc["2022-12-31"] == 5.0
        assert s.loc["2023-01-31"] == 2.0

    def test_member_without_national_series(self, policy_raw):
        s = core.mapped_policy("FI", policy_raw, {"FI": 1999})
        assert np.isnan(s.loc["1998-06-30"])          # not borrowed from anyone
        assert s.loc["2010-06-30"] == 2.0

    def test_non_member_keeps_own_rate(self, policy_raw):
        s = core.mapped_policy("US", policy_raw, {"DE": 1999})
        assert (s == 1.0).all()

    def test_no_series_is_all_nan(self, policy_raw):
        assert core.mapped_policy("SG", policy_raw, {}).isna().all()

    def test_policy_code(self):
        assert core.policy_code_for("DE", {"DE": 1999}, {"DE", "XM"}) == ("XM", "DE")
        assert core.policy_code_for("FI", {"FI": 1999}, {"XM"}) == ("XM", "")
        assert core.policy_code_for("KR", {}, {"KR"}) == ("KR", "")
        assert core.policy_code_for("SG", {}, {"KR"}) == ("", "")

    def test_jump_at_euro_adoption_is_not_a_hike(self, policy_raw):
        # Croatia-like: national rate 0 until 2022-12, ECB rate from 2023-01.
        raw = policy_raw.copy()
        raw["HR"] = np.where(raw.index < "2023-01-01", 0.0, np.nan)
        raw["XM"] = np.where(raw.index < "2022-07-01", 0.0, 2.5)
        s = core.mapped_policy("HR", raw, {"HR": 2023})
        cyc = core.find_liftoff(s)
        assert cyc["liftoff"] == pd.Timestamp("2023-01-31")         # raw algorithm sees a jump
        r = core.exclude_regime_switch(cyc, 2023)
        assert not r["has_cycle"] and "regime switch" in r["reason"]
        # a real hike (not in the adoption month) is kept
        assert core.exclude_regime_switch(core.find_liftoff(raw["XM"]), 1999)["has_cycle"]

    def test_wb_iso3_maps_euro_area_to_emu(self):
        meta = pd.DataFrame({"iso2_wb": ["XM", "KR"], "iso3": ["LIC", "KOR"]})
        assert core.bis_to_wb_iso3(["XM", "KR"], meta) == {"XM": "EMU", "KR": "KOR"}


# ============================================================================ 20-year benchmark
class TestBenchmark:
    def test_mean_of_last_80_quarters(self):
        # 100 quarters: first 20 at 50, last 80 at 10 -> benchmark 10, not 18
        s = quarterly("2001-03-31", [50.0] * 20 + [10.0] * 80)
        b = core.benchmark_20y(s)
        assert b["mean"] == 10.0
        assert b["n_obs"] == 80 and b["complete"]
        assert b["end"] == s.index[-1]
        assert b["start"] == s.index[20]

    def test_window_ends_at_last_valid_observation(self):
        s = quarterly("2001-03-31", [10.0] * 90 + [np.nan] * 10)
        b = core.benchmark_20y(s)
        assert b["end"] == s.index[89]
        assert b["start"] == s.index[10]

    def test_short_history_flagged_incomplete(self):
        b = core.benchmark_20y(quarterly("2015-03-31", [5.0] * 40))
        assert b["n_obs"] == 40 and not b["complete"]

    def test_gap_is_level_minus_own_mean(self):
        df = pd.DataFrame({
            "AA_P": quarterly("2001-03-31", [10.0] * 79 + [14.0]),
            "BB_P": quarterly("2001-03-31", [30.0] * 79 + [30.8]),
        })
        gap, tbl = core.gap_vs_benchmark(df)
        assert gap["AA_P"].iloc[-1] == pytest.approx(14.0 - (10 * 79 + 14) / 80)
        assert gap["BB_P"].iloc[-1] == pytest.approx(30.8 - (30 * 79 + 30.8) / 80)
        # a higher level does not mean a higher gap
        assert df["BB_P"].iloc[-1] > df["AA_P"].iloc[-1]
        assert gap["BB_P"].iloc[-1] < gap["AA_P"].iloc[-1]

    def test_empty(self):
        assert np.isnan(core.benchmark_20y(pd.Series(dtype=float))["mean"])


# ============================================================================ correlation
class TestCorrelation:
    def test_fisher_ci_contains_r_and_shrinks_with_n(self):
        lo1, hi1 = core.fisher_ci(0.5, 10)
        lo2, hi2 = core.fisher_ci(0.5, 100)
        assert lo1 < 0.5 < hi1 and lo2 < 0.5 < hi2
        assert (hi2 - lo2) < (hi1 - lo1)

    def test_fisher_ci_undefined_for_small_n(self):
        assert all(np.isnan(core.fisher_ci(0.5, 3)))

    def test_corr_with_ci_uses_pairwise_complete(self):
        x = [1, 2, 3, 4, 5, np.nan]
        y = [2, 4, 6, 8, np.nan, 12]
        r = core.corr_with_ci(x, y)
        assert r["n"] == 4 and r["r"] == pytest.approx(1.0)
        assert np.isnan(r["lo"])                       # |r| = 1: interval undefined


# ============================================================================ real data invariants
DATA = ROOT / "data"
needs_data = pytest.mark.skipif(not (DATA / "meta" / "countries.csv").exists(),
                                reason="run scripts/fetch_data.py first")


@needs_data
def test_pipeline_never_fills_missing_values():
    t = core.load_tables(DATA)
    raw = pd.read_csv(DATA / "raw" / "dsr.csv")
    assert int(t["dsr"].notna().sum().sum()) == int(raw["OBS_VALUE"].notna().sum())


@needs_data
def test_euro_members_use_ecb_rate_in_cycle():
    # Members that adopted the euro before the 2021-2023 window share the ECB lift-off.
    # (Croatia adopted in 2023: the switch from its national rate is a regime change,
    # and Croatia has no DSR series, so it never enters the lag analysis.)
    t = core.load_tables(DATA)
    early = [c for c, y in t["euro_since"].items() if y <= 2020]
    assert len(early) >= 12
    for c in early:
        assert core.find_liftoff(t["policy"][c])["liftoff"] == core.find_liftoff(t["policy"]["XM"])["liftoff"]
