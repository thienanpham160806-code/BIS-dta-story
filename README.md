# How long does a rate hike take to bite? Policy rates and private-sector debt service across BIS economies

When a central bank starts raising rates, the private sector does not feel it at once: existing loans reprice gradually. I measure that delay with BIS data. For every economy that tightened in 2021–2023, a fixed rule finds the month of lift-off, and I count the quarters until the private non-financial sector's debt service ratio (DSR) peaked. Across the 22 economies where that peak can be measured, the median delay is **8 quarters** (interquartile range 6–11). Four Asian economies anchor the story. Korea and Hong Kong SAR sit at the median, Thailand slightly below it, and Malaysia's DSR never rose above its pre-hike level. Hong Kong is still **7.6 percentage points** above its own 20-year average in 2026-Q1.

**Live demo:** _not deployed yet_ — the site runs locally (see [How to run](#how-to-run)); a Vercel configuration is included.

![Dashboard, desktop, light theme](docs/screenshots/dashboard-desktop-light.png)

---

## Contents

- [Research question](#research-question)
- [Data](#data)
- [Methodology](#methodology)
- [Key findings](#key-findings)
- [How to use the dashboard](#how-to-use-the-dashboard)
- [Limitations](#limitations)
- [How to run](#how-to-run)
- [Project structure](#project-structure)
- [Author](#author)
- [Use of AI tools](#use-of-ai-tools)

## Research question

After the 2021–2023 tightening cycle, **how long did it take for higher policy rates to reach the private sector's debt service burden, and has that burden returned to normal?** I answer it in two layers:

1. **Global:** a lag distribution over every economy for which the BIS publishes a DSR.
2. **Focus:** Korea, Thailand, Malaysia and Hong Kong SAR, the four economies the project started with, placed inside that distribution.

The comparison is always against each economy's own history. The BIS stresses that DSR levels are not comparable across countries, because income definitions, loan maturities and lending structures differ.

## Data

All raw files are downloaded by [`scripts/fetch_data.py`](scripts/fetch_data.py) and never edited by hand. The figures below come from the run on 2026-10-06 ([`data/meta/fetch_summary.json`](data/meta/fetch_summary.json)).

| Dataset | Source / code | Unit | Frequency | Coverage in this repo |
|---|---|---|---|---|
| Debt service ratio (DSR), borrowers H / N / P | BIS `WS_DSR 1.0` | % of income | Quarterly | 32 economies, 1999-Q1 (Türkiye 2002-Q1) → 2026-Q1. The household/corporate split exists for 17 of them. 0% missing since 2020 for every series. |
| Credit to the non-financial sector, H / N / P | BIS `WS_TC 2.0` (all lenders, market value, adjusted for breaks) | % of GDP | Quarterly, end of period | 43 economies + euro area aggregate, from 1947-Q4 at the earliest → 2026-Q1. 0% missing since 2020. |
| Central bank policy rate | BIS `WS_CBPOL 1.0` | % per year | Monthly, end of period | 51 economies + euro area. 47 run to 2026-08, three end in 2026-06/07, Argentina in 2025-06; Singapore has none. |
| Bank NPL to gross loans | World Bank `FB.AST.NPER.ZS` | % of gross loans | Annual | 50 economies. Latest year is 2025 for 36 of them, 2024 for 10, and earlier for 4 (Korea and Russia 2023, Japan 2022, Singapore 2019). |

In total the script downloads **52 economies plus the euro area aggregate**: every economy that appears in at least one of the three BIS datasets. BIS's own regional and income aggregates are not treated as economies.

**Metadata files built by the same script**

- [`data/meta/countries.csv`](data/meta/countries.csv) has one row per economy. It gives the ISO2 code, English and Vietnamese names, World Bank region, and the advanced/emerging group. The group follows the BIS *Convention for country groupings* (January 2026), parsed from the BIS PDF. It also records whether DSR H/N/P exist, the first and last period of each dataset, and the policy-rate code used.
- [`data/meta/coverage.csv`](data/meta/coverage.csv) gives the percentage of missing observations by economy × series × period (1999–2009, 2010–2019, 2020–latest, 1999–latest).
- [`data/meta/euro_area_members.csv`](data/meta/euro_area_members.csv) lists euro area members and their year of adoption, parsed from the ECB's euro area page.

**Policy-rate mapping.** The 13 euro area members in the data use the ECB rate (BIS `XM`) from January of their euro adoption year, and their national rate before that, where the BIS has one. Hong Kong keeps the HKMA base rate but is flagged as a USD peg. Denmark is flagged as a fixed exchange rate against the euro. Singapore runs monetary policy through the exchange rate and has no policy-rate series, so it is left empty rather than given a proxy.

**Missing data are never filled.** No interpolation or carried-forward values, and no proxy series. A missing observation stays missing in every table and chart, and the dashboard says so next to the chart.

## Methodology

All calculations live in one module, [`analysis/core.py`](analysis/core.py). The notebook and the site builder both call `core.run_all()`, so they cannot disagree.

**20-year benchmark.** For each DSR series, the benchmark is the mean of its last 80 quarterly observations: 2006-Q2 → 2026-Q1 for every series in this vintage, with all 80 quarters present. The *gap* is DSR minus that benchmark, in percentage points (pp). All cross-country comparisons use the gap or changes in it.

**Lift-off date (algorithm).** On the monthly policy rate (mapped as above), inside the window January 2021 – December 2023:

1. *trough* = the earliest month at which the rate reaches its minimum within the window;
2. *lift-off* = the first later month, still inside the window, with a rate above that minimum;
3. *cycle peak* = the highest rate from lift-off to December 2024; *hike size* = peak − trough.

If step 2 finds nothing, the economy is marked **"no hiking cycle"** and excluded from the lag analysis. This applies to China and Japan, and to Singapore, which has no series. I add one extra rule. A jump in the month an economy adopts the euro is the switch from a national rate to the ECB rate, not a policy decision, so it is not counted as a lift-off. This applies to Croatia in January 2023.

**Lag.** The lift-off quarter is the quarter that contains the lift-off month. The DSR peak is the first quarter with the highest DSR from the lift-off quarter onwards, and the lag is the number of quarters between the two. Because lift-off is monthly and DSR is quarterly, **lags are accurate to ±1 quarter**, so I report them in whole quarters and not in months. Two flags:

- **Censored**: the peak falls on the last observation in the sample, so the true peak may still lie ahead and the lag is only a lower bound. Censored series are drawn as hollow markers and left out of the headline median. As a check I also report the median with censored lags treated as lower bounds, and a Kaplan–Meier median.
- **No rise**: the DSR never exceeds its pre-lift-off level, or peaks in the lift-off quarter itself and only falls afterwards. There is no transmission peak to time, so these series are excluded from the distribution and listed.

The headline result uses the private non-financial sector series (**P**), which exists for all 32 economies. Households (**H**) and corporations (**N**) are a split analysis for the 17 economies that publish them.

**Correlations.** Every coefficient is reported with its **n** and a **95% confidence interval** (Fisher z). For NPL against DSR, I take the DSR's Q4 value as the year-end observation and do not interpolate NPL to quarters. I report correlations of levels and of annual changes. All of them are **descriptive only**.

**Cross-country comparison.** For economies with a measured lag, I relate the hike size (pp) to the DSR rise (pp) and to the lag. The DSR rise is a change within each economy's own series, so it is comparable across economies. I report Pearson with a CI, Spearman, and a robustness check that drops cycles larger than 10 pp.

## Key findings

All numbers below come from the current run (`notebooks/01_analysis.ipynb`, `product/site/data.json`).

**1. The typical lag is two years, not 12–18 months.**

| Borrowers | Measured lags (n) | Median | IQR | Range | Censored | No rise | No cycle |
|---|---|---|---|---|---|---|---|
| **Private non-financial sector (P)** | **22** | **8 quarters** | **6–11** | 1–17 | 2 (Brazil ≥ 20, India ≥ 15) | 6 (DE, ES, FR, GB, MY, NL) | 2 (CN, JP) |
| Households (H) | 10 | 5.5 | 5–7.75 | 3–13 | 1 | 5 | 1 |
| Non-financial corporations (N) | 6 | 9.5 | 7.25–11.75 | 2–12 | 1 | 9 | 1 |

Treating the two censored P series as lower bounds leaves the median at 8 quarters; the Kaplan–Meier median is also 8. My original hypothesis of a 12–18-month lag (4–6 quarters) sits at the short end of what the data show.

**2. The four focus economies are typical in timing and differ in size.**

| Economy | Lift-off | Hike (pp) | DSR peak | Lag | DSR rise (pp) | Gap vs 20-year mean, 2026-Q1 |
|---|---|---|---|---|---|---|
| Hong Kong SAR | 03/2022 (same month and size as the Fed) | +5.25 | 2024-Q1 | 8 quarters | +5.9 | **+7.6 pp** |
| Korea | 08/2021 | +3.00 | 2023-Q3 | 8 quarters | +2.8 | +0.7 pp |
| Thailand | 08/2022 | +2.00 | 2024-Q1 | 6 quarters | +0.8 | −0.5 pp |
| Malaysia | 05/2022 | +1.25 | — | no rise | — | +0.2 pp |

Korea also publishes the household/corporate split. Corporations peaked after 8 quarters with a rise of +7.8 pp. Households peaked after 12 quarters (2024-Q3) with a much smaller rise of +0.6 pp.

**3. Recovery is uneven.** In 2026-Q1, 17 of the 32 economies still have a DSR above their own 20-year mean. The largest gaps are in Türkiye (+10.9 pp), Brazil (+10.6), Russia (+7.8) and Hong Kong (+7.6). Hong Kong has unwound only 29% of its peak excess (from +10.7 to +7.6 pp). Korea has unwound 77%, and Thailand is now below its benchmark.

**4. Bigger hikes go with bigger DSR rises, but only because of a few extreme cycles.** Across the 24 economies with a measured rise, Pearson r = 0.91 (95% CI 0.79 to 0.96), while the Spearman rank correlation is only 0.47. Dropping the four cycles above 10 pp (Brazil, Hungary, Russia, Türkiye) leaves **r = 0.09 (95% CI −0.37 to 0.51, n = 20)**. Hike size tells us essentially nothing about the *lag*: r = −0.03 (95% CI −0.44 to 0.40, n = 22). These are descriptive correlations, not causal estimates.

**5. NPLs do not track the DSR.** Of the 32 DSR economies, 30 have a confidence interval for the correlation of annual changes that includes zero. Norway's is the exception (r = 0.59, 95% CI 0.14 to 0.84, n = 16), and Germany has too few NPL years for an interval (n = 3). For the focus economies, for example, Hong Kong r = −0.27 (95% CI −0.66 to 0.25, n = 17) and Korea r = −0.08 (95% CI −0.58 to 0.47, n = 14). With 3–20 annual observations per economy, the data cannot show a link either way.

## How to use the dashboard

The site has three pages: **Bảng điều khiển** (dashboard), **Câu chuyện dữ liệu** (the data story on the four focus economies, with a section placing them in the global distribution), and **Hướng dẫn** (guide). The interface is in Vietnamese.

![Choosing an economy, changing the years, switching to the deviation view and copying the link](docs/screenshots/how-to-use.gif)

1. **Choose economies.** *Chọn nước* opens a searchable list grouped by region, which accepts Vietnamese or English names. It has quick selections for the 4 original economies, Asia, the euro area, advanced and emerging economies. Each economy keeps one colour on every chart. The four original economies have fixed colours, and the others take the first free colour in the order they appear in the link. With more than six economies, line charts switch to small multiples.
2. **Choose the borrower group.** P, H or N. H and N are hidden when none of the selected economies publishes them.
3. **Choose the years.** The two-handle slider also works with the arrow keys. Its end year sets the quarter coloured on the world map and used by the KPI cards.
4. **Level or deviation.** The default view is the deviation from each economy's own 20-year mean. The level view carries a warning that levels are not comparable across countries.
5. **Share.** Every filter is stored in the address (for example `?c=KR,TH,MY,HK&from=2016&to=2026&b=P`). *Sao chép link* copies it.

Every chart title states the finding, computed from the data. The source and unit sit under each chart, and **ⓘ Cách đọc** opens a short card with three parts: what the chart shows, how to read it, and what not to conclude from it. On first visit a five-step tour points at the controls, and the **?** button reopens it. Missing data appear as gaps with a note naming the economies. The light and dark themes share one chart template.

| Mobile (375 px), dark | Filters as a drawer on mobile | Story page |
|---|---|---|
| ![Dashboard on mobile, dark theme](docs/screenshots/dashboard-mobile-dark.png) | ![Filter drawer on mobile](docs/screenshots/filters-drawer-mobile-light.png) | ![Story page](docs/screenshots/story-desktop-light.png) |

Measured with Lighthouse 12.8 against the local server, with default mobile throttling unless noted:

| Page | Performance (mobile) | Performance (desktop) | Accessibility | Best practices |
|---|---|---|---|---|
| Dashboard | 92 | 97 | 100 | 100 |
| Story | 86 | – | 100 | – |
| Guide | 98 | – | 100 | – |

## Limitations

- **One peak per economy.** The lag is measured as the distance to a single peak on a quarterly ratio (±1 quarter). Another shock in the same window, such as pandemic-era income swings or fiscal support, can move that peak.
- **Censoring.** Brazil's and India's DSRs are still at their sample high, so their lags are lower bounds. Only two series are affected, but the headline median would rise if their peaks turn out to be much later.
- **DSR construction.** The BIS computes the DSR under fixed assumptions about remaining maturity and amortisation. Levels are not comparable across economies, which is why the analysis uses gaps and changes.
- **Coverage of the split.** Only 17 of the 32 economies have the household/corporate DSR. Thailand, Malaysia and Hong Kong have the aggregate only.
- **Exchange-rate regimes.** Hong Kong (USD peg) and Denmark (euro peg) have policy rates that mostly mirror another central bank. Singapore has no policy rate in the data.
- **NPL.** NPLs are annual, cover the whole banking system and are published with delays, so every NPL–DSR correlation is descriptive.
- **No forecasts.** Every chart and number stops at the latest observation (DSR and credit 2026-Q1, policy rates 2026-08, NPL 2025).

## How to run

Requires Python ≥ 3.10.

```bash
pip install -r requirements.txt

python scripts/fetch_data.py            # download raw data (uses data/cache; add --refresh to re-download)
jupyter nbconvert --to notebook --execute --inplace notebooks/01_analysis.ipynb
python product/build_site.py            # data/raw -> product/site/data.json + data-series.json
python product/serve.py                 # http://localhost:8000 (rebuilds automatically if data changed)
pytest -q                               # unit tests for the analysis module
```

The site is static and works offline. Plotly (the official `geo` partial bundle of the same version as the Python package), the world map and the fonts are vendored. `python product/vendor_assets.py` re-downloads them. Do not open `product/site/index.html` directly from disk: browsers block `fetch()` on `file://`.

**Deployment.** [`vercel.json`](vercel.json) serves `product/site` as a static site with no build step. The data are built locally and committed, so the deployed numbers are exactly the ones in this repository.

**Continuous integration.** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the unit tests and executes the notebook end to end. It also rebuilds the site data from `data/raw` and fails if the result differs from the committed files.

## Project structure

```
BIS-dta-story/
├── scripts/fetch_data.py        # BIS SDMX v2 + World Bank + ECB/BIS reference lists -> data/raw, data/meta
├── data/
│   ├── raw/                     # files exactly as downloaded (two large BIS files gzip-compressed)
│   ├── meta/                    # countries.csv, coverage.csv, euro_area_members.csv, ...
│   └── processed/               # tables written by the notebook
├── analysis/core.py             # every calculation: benchmark, lift-off, lag, censoring, CIs
├── notebooks/01_analysis.ipynb  # analysis and data story (Vietnamese), calls analysis.core
├── tests/test_core.py           # synthetic series with known answers + invariants on real data
├── product/
│   ├── build_site.py            # analysis.core -> site/data.json, site/data-series.json
│   ├── serve.py                 # local server (127.0.0.1), gzip, auto-rebuild
│   ├── vendor_assets.py         # downloads plotly bundle, world map, fonts
│   ├── DESIGN.md                # design system (direction A, editorial)
│   └── site/                    # index.html, styles.css, tokens.css, guide.json, js/, vendor/, fonts/
├── docs/screenshots/            # screenshots and the usage GIF
├── vercel.json                  # static deploy configuration
├── DECLARATION_AI.md            # declaration of AI use (Vietnamese)
└── INTERVIEW_NOTES.md           # notes for presenting the project (Vietnamese)
```

## Author

**Pham Ngoc Thien An** (Phạm Ngọc Thiên An)
Student ID K244141653 · Faculty of Finance and Banking, University of Economics and Law, VNU-HCM

## Use of AI tools

I used an AI coding assistant for parts of the code, the calculations and the drafting. What it did, what I decided, and how I checked the results are declared in [DECLARATION_AI.md](DECLARATION_AI.md).
