"""
Fetch every raw input for the project, for every economy the sources publish.

Run   : python scripts/fetch_data.py            (uses the on-disk HTTP cache)
        python scripts/fetch_data.py --refresh  (ignore the cache, re-download)

Output
------
data/raw/
    dsr.csv                  BIS WS_DSR 1.0   - debt service ratios, all economies, H/N/P, full history
    credit_gdp.csv.gz        BIS WS_TC 2.0    - credit to H/N/P, % of GDP, all economies, full history
    policy_rate.csv.gz       BIS WS_CBPOL 1.0 - central bank policy rates, monthly, full history
    npl_ratio_worldbank.csv  World Bank FB.AST.NPER.ZS - bank NPL ratio, annual, full history
    wb_country_meta.csv      World Bank country API - ISO2/ISO3 and region
data/meta/
    euro_area_members.csv    parsed from the ECB "euro area" country page (euro adoption year)
    bis_country_groups.csv   parsed from BIS "Convention for country groupings" (advanced list)
    countries.csv            one row per economy: names, region, group, coverage, policy-rate mapping
    coverage.csv             % missing by economy x dataset x period
    fetch_summary.json       how many economies were actually downloaded, and when

The two large BIS files are stored gzip-compressed. Compression is lossless: the file is
exactly what the API returned, and pandas reads it directly (pd.read_csv(...csv.gz)).

Endpoint notes (kept from the first version of this script)
----------------------------------------------------------
data.bis.org/topics/... is the BIS web UI and answers HTTP 404 to data requests. The data
API is the BIS SDMX RESTful API v2:
    https://stats.bis.org/api/v2/data/dataflow/BIS/{FLOW}/{VERSION}/{KEY}?format=csv&labels=both
Dataflow versions confirmed against /api/v2/structure/dataflow/BIS: WS_DSR 1.0, WS_TC 2.0,
WS_CBPOL 1.0. `labels=both` emits code and label columns side by side.

Dimension order, from the DSDs:
    BIS_DSR(1.0)           FREQ . BORROWERS_CTY . DSR_BORROWERS
    BIS_TOTAL_CREDIT(2.0)  FREQ . BORROWERS_CTY . TC_BORROWERS . TC_LENDERS
                           . VALUATION . UNIT_TYPE . TC_ADJUST
    BIS_CBPOL(1.0)         FREQ . REF_AREA
An empty position in a key means "all values", so `Q..H+N+P` is every economy.
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import html
import io
import json
import re
import sys
from pathlib import Path

import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from analysis import core  # noqa: E402  (shared logic: mapping, coverage)

RAW = ROOT / "data" / "raw"
META = ROOT / "data" / "meta"
CACHE = ROOT / "data" / "cache"
for d in (RAW, META, CACHE):
    d.mkdir(parents=True, exist_ok=True)

BIS_API = "https://stats.bis.org/api/v2/data/dataflow/BIS"
WB_API = "https://api.worldbank.org/v2"
ECB_EURO_PAGE = "https://www.ecb.europa.eu/euro/intro/html/map.en.html"
BIS_GROUPS_PDF = "https://www.bis.org/statistics/country_groupings.pdf"

BIS_DATASETS = {
    "dsr": {"flow": "WS_DSR", "version": "1.0", "key": "Q..H+N+P",
            "file": "dsr.csv", "gzip": False},
    # TC_LENDERS=A all sectors, VALUATION=M market value, UNIT_TYPE=770 % of GDP,
    # TC_ADJUST=A adjusted for breaks (codes checked against the BIS codelists).
    "credit_gdp": {"flow": "WS_TC", "version": "2.0", "key": "Q..H+N+P.A.M.770.A",
                   "file": "credit_gdp.csv.gz", "gzip": True},
    "policy_rate": {"flow": "WS_CBPOL", "version": "1.0", "key": "M.",
                    "file": "policy_rate.csv.gz", "gzip": True},
}

# Vietnamese display names. Translation only: no data lives here.
NAME_VI = {
    "AR": "Argentina", "AT": "Áo", "AU": "Úc", "BE": "Bỉ", "BR": "Brazil", "CA": "Canada",
    "CH": "Thụy Sĩ", "CL": "Chile", "CN": "Trung Quốc", "CO": "Colombia", "CZ": "Séc",
    "DE": "Đức", "DK": "Đan Mạch", "ES": "Tây Ban Nha", "FI": "Phần Lan", "FR": "Pháp",
    "GB": "Anh", "GR": "Hy Lạp", "HK": "Hong Kong", "HR": "Croatia", "HU": "Hungary",
    "ID": "Indonesia", "IE": "Ireland", "IL": "Israel", "IN": "Ấn Độ", "IS": "Iceland",
    "IT": "Ý", "JP": "Nhật Bản", "KR": "Hàn Quốc", "KW": "Kuwait", "LU": "Luxembourg",
    "MA": "Maroc", "MK": "Bắc Macedonia", "MX": "Mexico", "MY": "Malaysia", "NL": "Hà Lan",
    "NO": "Na Uy", "NZ": "New Zealand", "PE": "Peru", "PH": "Philippines", "PL": "Ba Lan",
    "PT": "Bồ Đào Nha", "RO": "Romania", "RS": "Serbia", "RU": "Nga", "SA": "Ả Rập Xê Út",
    "SE": "Thụy Điển", "SG": "Singapore", "TH": "Thái Lan", "TR": "Thổ Nhĩ Kỳ", "US": "Mỹ",
    "XM": "Khu vực euro", "ZA": "Nam Phi",
}

# BIS aggregates that are not economies. XM (euro area) is kept: it is the
# policy-rate source for every euro member and has its own credit series.
BIS_AGGREGATES = {"4T", "5A", "5R", "G2"}

# Exchange-rate-centred regimes. Each note links the central bank's own page.
REGIME_NOTES = {
    "HK": ("USD peg (Linked Exchange Rate System). The HKMA base rate is set by formula "
           "from the US policy rate, so Hong Kong imports the Fed cycle.",
           "https://www.hkma.gov.hk/eng/key-functions/money/linked-exchange-rate-system/"),
    "SG": ("MAS conducts monetary policy through the exchange rate (S$NEER), not an "
           "interest rate; BIS WS_CBPOL has no Singapore series.",
           "https://www.mas.gov.sg/monetary-policy"),
    "DK": ("Fixed exchange rate policy against the euro; Danmarks Nationalbank's rate "
           "is set to keep the krone stable, so it largely follows the ECB.",
           "https://www.nationalbanken.dk/en/what-we-do/stable-prices-monetary-policy-and-the-danish-economy"),
}


# ----------------------------------------------------------------------------- HTTP
def make_session() -> requests.Session:
    """Session with exponential back-off on transient failures (429 / 5xx / resets)."""
    s = requests.Session()
    retry = Retry(total=5, connect=5, read=5, backoff_factor=1.5,
                  status_forcelist=(429, 500, 502, 503, 504),
                  allowed_methods=frozenset({"GET"}), raise_on_status=False)
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.headers["User-Agent"] = "BIS-dta-story/2.0 (+https://github.com/thienanpham160806-code/BIS-dta-story)"
    return s


SESSION = make_session()
REFRESH = False


def get_cached(url: str, params: dict | None = None, timeout: int = 180) -> bytes:
    """GET with an on-disk cache keyed by URL + params. --refresh bypasses the cache."""
    req = requests.Request("GET", url, params=params).prepare()
    key = hashlib.sha1(req.url.encode()).hexdigest()[:16]
    path = CACHE / key
    if path.exists() and not REFRESH:
        print(f"  [cache] {req.url}")
        return path.read_bytes()
    print(f"  [GET]   {req.url}")
    resp = SESSION.get(req.url, timeout=timeout)
    if resp.status_code != 200:
        raise RuntimeError(f"HTTP {resp.status_code} for {req.url}\n{resp.text[:400]}")
    path.write_bytes(resp.content)
    return resp.content


# ----------------------------------------------------------------------------- BIS
def fetch_bis(name: str, spec: dict) -> pd.DataFrame:
    url = f"{BIS_API}/{spec['flow']}/{spec['version']}/{spec['key']}"
    print(f"\n=== BIS {spec['flow']} {spec['version']} ({name}) ===")
    body = get_cached(url, {"format": "csv", "labels": "both"})
    df = pd.read_csv(io.BytesIO(body), low_memory=False)
    if df.empty:
        raise RuntimeError(f"{name}: empty response - key wrong or series withdrawn")
    out = RAW / spec["file"]
    if spec["gzip"]:
        # mtime=0 keeps the archive byte-identical across runs with the same data.
        with open(out, "wb") as fh, gzip.GzipFile(fileobj=fh, mode="wb", mtime=0) as gz:
            gz.write(body)
    else:
        out.write_bytes(body)
    print(f"  saved {out.relative_to(ROOT)}  {len(df):,} rows")
    return df


# ----------------------------------------------------------------------------- World Bank
def fetch_wb_country_meta() -> pd.DataFrame:
    print("\n=== World Bank country metadata (ISO codes, region) ===")
    body = get_cached(f"{WB_API}/country", {"format": "json", "per_page": 400})
    rows = json.loads(body)[1]
    df = pd.DataFrame([{
        "iso2_wb": r["iso2Code"], "iso3": r["id"], "wb_name": r["name"],
        "region": r["region"]["value"].strip(),
    } for r in rows])
    df.to_csv(RAW / "wb_country_meta.csv", index=False)
    print(f"  saved data/raw/wb_country_meta.csv  {len(df)} rows")
    return df


def fetch_npl(iso3_codes: list[str]) -> pd.DataFrame:
    print("\n=== World Bank NPL ratio FB.AST.NPER.ZS (all years) ===")
    url = f"{WB_API}/country/{';'.join(sorted(iso3_codes))}/indicator/FB.AST.NPER.ZS"
    payload = json.loads(get_cached(url, {"format": "json", "per_page": 20000}))
    if not isinstance(payload, list) or len(payload) < 2 or payload[1] is None:
        raise RuntimeError(f"World Bank returned no data: {str(payload)[:300]}")
    df = pd.DataFrame([{
        "country": r["country"]["value"], "countryiso3code": r["countryiso3code"],
        "date": int(r["date"]), "NPL_ratio": r["value"],
    } for r in payload[1]]).sort_values(["countryiso3code", "date"])
    df.to_csv(RAW / "npl_ratio_worldbank.csv", index=False)
    print(f"  saved data/raw/npl_ratio_worldbank.csv  {len(df)} rows, "
          f"{df.dropna().countryiso3code.nunique()} economies with at least one value")
    return df


# ----------------------------------------------------------------------------- official lists
def fetch_euro_area_members() -> pd.DataFrame:
    """Parse 'Country ... Euro since YYYY' from the ECB euro area page."""
    print("\n=== Euro area members (ECB) ===")
    raw = get_cached(ECB_EURO_PAGE).decode("utf-8", "replace")
    raw = re.sub(r"<script.*?</script>|<style.*?</style>", " ", raw, flags=re.S)
    text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", raw)))
    # A name is 1-3 capitalised words directly before the status text; this skips UI
    # text such as "Please select a country" that precedes the first entry.
    pat = re.compile(r"((?:[A-Z][a-z]+ ){0,2}[A-Z][a-z]+) EU member using the euro EU "
                     r"(?:founding )?member (?:since|in) \d{4} Euro since (\d{4})")
    found = {m.group(1).removeprefix("The ").strip(): int(m.group(2)) for m in pat.finditer(text)}
    if len(found) < 19:
        raise RuntimeError(f"ECB page parse found only {len(found)} members - page layout changed?")
    df = pd.DataFrame(sorted(found.items()), columns=["ecb_name", "euro_since"])
    df["source"] = ECB_EURO_PAGE
    df["retrieved"] = dt.date.today().isoformat()
    print(f"  {len(df)} members: " + ", ".join(f"{n} {y}" for n, y in found.items()))
    return df


def fetch_bis_advanced_list() -> list[str]:
    """Advanced-economy names from the BIS 'Convention for country groupings' PDF."""
    import pdfplumber

    print("\n=== BIS country groupings (advanced vs EMDE) ===")
    body = get_cached(BIS_GROUPS_PDF)
    with pdfplumber.open(io.BytesIO(body)) as pdf:
        text = " ".join(p.extract_text() or "" for p in pdf.pages)
    text = re.sub(r"\s+", " ", text)
    m = re.search(r"Advanced economies \(AEs\): (.+?) Emerging market and developing", text)
    if not m:
        raise RuntimeError("BIS groupings PDF: advanced-economy sentence not found")
    body_txt = re.sub(r"\d", "", m.group(1))                     # drop footnote markers
    body_txt = body_txt.replace(" and selected overseas and dependent territories", "")
    names = [n.strip().removeprefix("and ").removeprefix("the ").strip(" .")
             for n in re.split(r",| and (?=the United States)", body_txt)]
    names = [n for n in names if n]
    print(f"  advanced: {names}")
    return names


# ----------------------------------------------------------------------------- build meta
def norm(name: str) -> str:
    return re.sub(r"[^a-z]", "", name.lower().replace("the ", ""))


def build_countries(dsr, credit, policy, npl, wb_meta, euro, advanced) -> pd.DataFrame:
    names = {}
    for df, cc, lab in [(dsr, "BORROWERS_CTY", "Borrowers' country"),
                        (credit, "BORROWERS_CTY", "Borrowers' country"),
                        (policy, "REF_AREA", "Reference area")]:
        names.update(dict(zip(df[cc], df[lab])))
    codes = sorted(set(names) - BIS_AGGREGATES)

    euro_since = {}
    for _, r in euro.iterrows():
        hit = [c for c in codes if norm(names[c]) == norm(r["ecb_name"])]
        if hit:
            euro_since[hit[0]] = int(r["euro_since"])
    adv_norm = {norm(n) for n in advanced}

    wb = wb_meta.set_index("iso2_wb")
    tables = core.tidy_all(dsr, credit, policy, npl, wb_meta)
    rows = []
    for c in codes:
        is_agg = c == "XM"
        rec = {
            "iso2": c, "name_en": names[c], "name_vi": NAME_VI.get(c, names[c]),
            "iso3": "EMU" if is_agg else (wb.loc[c, "iso3"] if c in wb.index else ""),
            "region": "Europe & Central Asia" if is_agg else (wb.loc[c, "region"] if c in wb.index else ""),
            "is_aggregate": is_agg,
            # BIS: AEs are the listed economies plus the euro area; all others are EMDEs.
            "group": "advanced" if (is_agg or c in euro_since or norm(names[c]) in adv_norm) else "emerging",
            "euro_member": c in euro_since,
            "euro_since": euro_since.get(c, ""),
        }
        for b in "HNP":
            s = tables["dsr"].get(f"{c}_{b}")
            rec[f"has_dsr_{b}"] = bool(s is not None and s.notna().any())
        for ds in ("dsr", "credit", "npl"):
            cols = [k for k in tables[ds] if k.split("_")[0] == c]
            valid = pd.concat([tables[ds][k].dropna() for k in cols]) if cols else pd.Series(dtype=float)
            rec[f"{ds}_first"] = core.period_label(valid.index.min(), ds) if len(valid) else ""
            rec[f"{ds}_last"] = core.period_label(valid.index.max(), ds) if len(valid) else ""
        code, pre = core.policy_code_for(c, euro_since, set(tables["policy_raw"].columns))
        rec["policy_code"] = code
        rec["policy_code_pre_euro"] = pre
        mapped = core.mapped_policy(c, tables["policy_raw"], euro_since)
        rec["policy_first"] = core.period_label(mapped.first_valid_index(), "policy") if mapped.notna().any() else ""
        rec["policy_last"] = core.period_label(mapped.last_valid_index(), "policy") if mapped.notna().any() else ""
        note, url = REGIME_NOTES.get(c, ("", ""))
        if rec["euro_member"]:
            note = (f"Euro area member since {euro_since[c]}: policy rate = ECB (BIS XM) from "
                    f"{euro_since[c]}-01" + (f"; national rate ({pre}) before." if pre else "."))
            url = ECB_EURO_PAGE
        rec["policy_note"] = note
        rec["policy_note_source"] = url
        rows.append(rec)
    return pd.DataFrame(rows)


def main() -> None:
    global REFRESH
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--refresh", action="store_true", help="ignore the HTTP cache")
    REFRESH = ap.parse_args().refresh

    dsr = fetch_bis("dsr", BIS_DATASETS["dsr"])
    credit = fetch_bis("credit_gdp", BIS_DATASETS["credit_gdp"])
    policy = fetch_bis("policy_rate", BIS_DATASETS["policy_rate"])
    wb_meta = fetch_wb_country_meta()
    euro = fetch_euro_area_members()
    advanced = fetch_bis_advanced_list()

    euro.to_csv(META / "euro_area_members.csv", index=False)
    pd.DataFrame({"name": advanced, "group": "advanced", "source": BIS_GROUPS_PDF}) \
        .to_csv(META / "bis_country_groups.csv", index=False)

    bis_codes = (set(dsr.BORROWERS_CTY) | set(credit.BORROWERS_CTY) | set(policy.REF_AREA)) - BIS_AGGREGATES
    iso3 = core.bis_to_wb_iso3(sorted(bis_codes), wb_meta)
    npl = fetch_npl(sorted(set(iso3.values())))

    countries = build_countries(dsr, credit, policy, npl, wb_meta, euro, advanced)
    countries.to_csv(META / "countries.csv", index=False)

    tables = core.load_tables(ROOT / "data")
    coverage = core.coverage_table(tables)
    coverage.to_csv(META / "coverage.csv", index=False)

    eco = countries[~countries.is_aggregate]          # counts below are economies only
    summary = {
        "retrieved": dt.date.today().isoformat(),
        "economies_total": len(eco),
        "aggregates": countries.loc[countries.is_aggregate, "iso2"].tolist(),
        "with_dsr": int(eco[["has_dsr_H", "has_dsr_N", "has_dsr_P"]].any(axis=1).sum()),
        "with_dsr_breakdown_HN": int((eco.has_dsr_H & eco.has_dsr_N).sum()),
        "with_credit": int((eco.credit_last != "").sum()),
        "with_policy_rate": int((eco.policy_last != "").sum()),
        "with_npl": int((eco.npl_last != "").sum()),
        "euro_members_in_data": int(eco.euro_member.sum()),
        "latest": {
            "dsr": max(filter(None, countries.dsr_last)),
            "credit": max(filter(None, countries.credit_last)),
            "policy": max(filter(None, countries.policy_last)),
            "npl": max(filter(None, countries.npl_last)),
        },
    }
    (META / "fetch_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print("\n=== Countries ===")
    print(countries[["iso2", "name_en", "group", "region", "has_dsr_H", "has_dsr_N", "has_dsr_P",
                     "dsr_last", "credit_last", "policy_code", "policy_last", "npl_last"]].to_string(index=False))
    print("\n=== Coverage (% missing), P / policy / NPL, by period ===")
    view = coverage[coverage.series.isin(["dsr_P", "policy", "npl"])]
    print(view.pivot_table(index="iso2", columns=["series", "period"], values="pct_missing").round(0).to_string())
    print("\n=== Summary ===")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
