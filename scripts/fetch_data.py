"""
Fetch raw data for Chu de 1: Do tre chinh sach that chat tien te & ganh nang tra no tu nhan.

Countries : Korea (KR), Thailand (TH), Malaysia (MY), Hong Kong SAR (HK)
Reference : United States (US) policy rate - the Fed cycle that drives the whole story
Period    : 2016-01-01 .. 2025-12-31 (analysis window)
            + one extra long-history DSR file (1999-Q1 ..) used ONLY to compute the
              20-year benchmark that BIS recommends for cross-country DSR comparison.

Run   : python scripts/fetch_data.py
Output: data/raw/*.csv (one file per dataset, untouched from source)

--------------------------------------------------------------------------------
API NOTE (2026-09-11) - why the URLs in this file changed
--------------------------------------------------------------------------------
The previous version pointed at https://data.bis.org/topics/{TOPIC}/{FLOW_REF}/{KEY}
That host is the BIS *web UI*, not a data API: every one of those calls returned
    HTTP 404  {"detail":"Not Found"}
(verified with a direct curl, not just via pandas.read_csv).

The working machine-readable endpoint is the BIS SDMX RESTful API v2:
    https://stats.bis.org/api/v2/data/dataflow/BIS/{FLOW_ID}/{VERSION}/{KEY}?format=csv

Dataflow versions were re-confirmed live against
    https://stats.bis.org/api/v2/structure/dataflow/BIS/?format=sdmx-json
    -> WS_DSR 1.0 | WS_TC 2.0 | WS_CBPOL 1.0   (unchanged, so only the host was wrong)

Two more parameter changes follow from the v2 API:
  * `include=code,label` (v1 style) is not a v2 parameter -> replaced by `labels=both`,
    which emits BOTH the code column and the human-readable label column
    (e.g. DSR_BORROWERS + "Borrowers"). Step 2 of the assignment reads labels from
    these files, so `labels=both` is required, not cosmetic.
  * `file_format=csv&format=long` -> plain `format=csv` (SDMX-CSV is already long).

Dimension order, taken from the real DSDs (not guessed):
    BIS_DSR(1.0)           FREQ . BORROWERS_CTY . DSR_BORROWERS
    BIS_TOTAL_CREDIT(2.0)  FREQ . BORROWERS_CTY . TC_BORROWERS . TC_LENDERS
                           . VALUATION . UNIT_TYPE . TC_ADJUST
    BIS_CBPOL(1.0)         FREQ . REF_AREA
"""

import io
from pathlib import Path

import pandas as pd
import requests

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

BIS_API = "https://stats.bis.org/api/v2/data/dataflow/BIS"

BIS_COUNTRIES = "KR+TH+MY+HK"
WB_COUNTRIES = "KOR;THA;MYS;HKG"  # World Bank dung ISO3

# Analysis window requested for the assignment.
START_Q, END_Q = "2016-Q1", "2025-Q4"
START_M, END_M = "2016-01", "2025-12"
START_Y, END_Y = "2016", "2025"

# BIS codes confirmed against the official codelists (see verify_codes() below):
#   CL_TC_BORROWERS : H = Households & NPISHs, N = Non-financial corporations,
#                     P = Private non-financial sector, C = Non financial sector,
#                     G = General government
#   CL_TC_LENDERS   : A = All sectors
#   CL_VALUATION    : M = Market value
#   CL_BIS_UNIT     : 770 = Percentage of GDP
#   CL_ADJUST       : A = Adjusted for breaks
BORROWERS = "H+N+P"

BIS_DATASETS = {
    "dsr": {
        "label": "Debt service ratios (analysis window)",
        "flow": "WS_DSR",
        "version": "1.0",
        "key": f"Q.{BIS_COUNTRIES}.{BORROWERS}",
        "start": START_Q,
        "end": END_Q,
        "group": ["BORROWERS_CTY", "DSR_BORROWERS"],
    },
    "dsr_longrun": {
        # Same series, full history. Used ONLY to compute each country's own 20-year
        # average (2006-2025), the benchmark BIS recommends instead of comparing raw
        # DSR levels across countries. Kept in a separate file so the analysis window
        # file above stays exactly 2016-2025.
        "label": "Debt service ratios (full history, for the 20-year benchmark)",
        "flow": "WS_DSR",
        "version": "1.0",
        "key": f"Q.{BIS_COUNTRIES}.{BORROWERS}",
        "start": None,
        "end": END_Q,
        "group": ["BORROWERS_CTY", "DSR_BORROWERS"],
    },
    "credit_gdp": {
        # H / N / P all requested: the DSR breakdown only exists for KR, but the
        # credit/GDP breakdown exists for all four countries, so "who borrows" can
        # still be answered for TH/MY/HK (as debt stock, NOT as debt service).
        "label": "Credit to non-financial sector (% GDP)",
        "flow": "WS_TC",
        "version": "2.0",
        "key": f"Q.{BIS_COUNTRIES}.{BORROWERS}.A.M.770.A",
        "start": START_Q,
        "end": END_Q,
        "group": ["BORROWERS_CTY", "TC_BORROWERS"],
    },
    "policy_rate": {
        "label": "Policy rates (monthly, incl. US as the Fed reference)",
        "flow": "WS_CBPOL",
        "version": "1.0",
        "key": f"M.{BIS_COUNTRIES}+US",
        "start": START_M,
        "end": END_M,
        "group": ["REF_AREA"],
    },
}


def fetch_bis(name: str, spec: dict) -> pd.DataFrame | None:
    """Download one BIS dataflow to data/raw/{name}.csv and report its coverage."""
    url = f"{BIS_API}/{spec['flow']}/{spec['version']}/{spec['key']}"
    params = {"format": "csv", "labels": "both"}
    if spec["start"]:
        params["startPeriod"] = spec["start"]
    if spec["end"]:
        params["endPeriod"] = spec["end"]

    print(f"\n=== {spec['label']} ({name}) - BIS ===")
    print(f"URL: {url}")
    print(f"Params: {params}")

    try:
        resp = requests.get(url, params=params, timeout=90)
    except Exception as exc:
        print(f"LOI mang: {exc}")
        return None

    if resp.status_code != 200:
        # Show the real response body, not just the exception pandas would raise.
        print(f"HTTP {resp.status_code} - body preview:\n{resp.text[:500]}")
        return None

    try:
        df = pd.read_csv(io.StringIO(resp.text))
    except Exception as exc:
        print(f"Khong parse duoc CSV: {exc}\nBody preview:\n{resp.text[:500]}")
        return None

    if df.empty:
        print("CANH BAO: dataframe rong - key co the sai hoac series khong ton tai.")
        return None

    out_path = RAW_DIR / f"{name}.csv"
    df.to_csv(out_path, index=False)
    print(f"Da luu {out_path} - {df.shape[0]} dong, {df.shape[1]} cot")

    # Coverage report per series: never silently accept an all-null country.
    cov = df.groupby(spec["group"]).agg(
        n_obs=("OBS_VALUE", "size"),
        n_valid=("OBS_VALUE", "count"),
        first=("TIME_PERIOD", "min"),
        last=("TIME_PERIOD", "max"),
    )
    cov["pct_missing"] = (1 - cov["n_valid"] / cov["n_obs"]) * 100
    print(cov.to_string())

    empty = cov.index[cov["n_valid"] == 0].tolist()
    if empty:
        print(f"CANH BAO: cac series sau KHONG co gia tri nao: {empty}")
    return df


def verify_codes() -> None:
    """Print the official BIS codelists so Step 2 confirms codes instead of guessing."""
    print("\n=== BIS codelists (nguon: stats.bis.org/api/v2/structure/codelist) ===")
    for cl in ("CL_TC_BORROWERS", "CL_TC_LENDERS", "CL_VALUATION", "CL_ADJUST"):
        url = f"https://stats.bis.org/api/v2/structure/codelist/BIS/{cl}/1.0"
        try:
            data = requests.get(url, params={"format": "sdmx-json"}, timeout=60).json()
        except Exception as exc:
            print(f"{cl}: khong lay duoc ({exc})")
            continue
        codes = {c["id"]: c.get("name") for lst in data["data"]["codelists"] for c in lst["codes"]}
        print(f"  {cl}: {codes}")

    # CL_BIS_UNIT is large; only the codes this project uses are relevant.
    url = "https://stats.bis.org/api/v2/structure/codelist/BIS/CL_BIS_UNIT/1.0"
    try:
        data = requests.get(url, params={"format": "sdmx-json"}, timeout=60).json()
        codes = {
            c["id"]: c.get("name")
            for lst in data["data"]["codelists"]
            for c in lst["codes"]
            if c["id"] in ("770", "799", "USD", "XDC")
        }
        print(f"  CL_BIS_UNIT (subset): {codes}")
    except Exception as exc:
        print(f"CL_BIS_UNIT: khong lay duoc ({exc})")


def fetch_npl_worldbank() -> None:
    """NPL ratio (no xau), World Bank indicator FB.AST.NPER.ZS - dung de cross-check DSR."""
    print("\n=== NPL ratio (World Bank, cross-check) ===")
    url = (
        f"https://api.worldbank.org/v2/country/{WB_COUNTRIES}/indicator/FB.AST.NPER.ZS"
        f"?format=json&date={START_Y}:{END_Y}&per_page=1000"
    )
    print(f"URL: {url}")
    try:
        payload = requests.get(url, timeout=60).json()
    except Exception as exc:
        print(f"Loi goi World Bank API: {exc}")
        return

    if not isinstance(payload, list) or len(payload) < 2 or payload[1] is None:
        print("World Bank tra ve rong - kiem tra lai ma nuoc/indicator.")
        print(payload)
        return

    df = pd.DataFrame(
        [
            {
                "country": r["country"]["value"],
                "countryiso3code": r["countryiso3code"],
                "date": r["date"],
                "NPL_ratio": r["value"],
            }
            for r in payload[1]
        ]
    )
    out_path = RAW_DIR / "npl_ratio_worldbank.csv"
    df.to_csv(out_path, index=False)
    print(f"Da luu {out_path} - {df.shape[0]} dong")

    cov = df.groupby("countryiso3code").agg(
        n_obs=("NPL_ratio", "size"),
        n_valid=("NPL_ratio", "count"),
        first=("date", "min"),
        last=("date", "max"),
    )
    cov["pct_missing"] = (1 - cov["n_valid"] / cov["n_obs"]) * 100
    print(cov.to_string())


if __name__ == "__main__":
    for name, spec in BIS_DATASETS.items():
        fetch_bis(name, spec)

    verify_codes()
    fetch_npl_worldbank()

    print("\nXong. data/raw/ giu nguyen ban goc, khong sua tay.")
    print("Buoc tiep theo: doc metadata (Buoc 2) -> DSR_BORROWERS H/N/P, UNIT_TYPE 770,")
    print("tan suat Q/M/A - roi moi lam sach. NPL la annual, DSR/credit quarterly,")
    print("policy rate monthly: phai dua ve cung tan suat truoc khi so sanh.")
