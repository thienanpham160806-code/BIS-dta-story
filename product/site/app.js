/* Dashboard + data story for the BIS debt-service project.
   All numbers come from data.json, which build_site.py regenerates from data/raw.
   Nothing on this page is hand-typed. */

let D = null;                       // the whole data.json payload
const S = {                         // UI state
  countries: ["KR", "TH", "MY", "HK"],
  range: "all",
  borrower: "P",
  phases: true,
  krSplit: false,
  table: "dsr",
  cat: "all",
};

const FLAGS = { KR: "🇰🇷", TH: "🇹🇭", MY: "🇲🇾", HK: "🇭🇰", US: "🇺🇸" };

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* ── theme ─────────────────────────────────────────────────────────────── */
function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function colorOf(c) {
  return css("--" + c.toLowerCase()) || "#888";
}
function isDark() {
  return document.documentElement.dataset.theme === "dark";
}
function updateThemeIcon() {
  const icon = $("#theme-icon");
  if (icon) icon.textContent = isDark() ? "☀️" : "🌙";
}
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("theme", t); } catch (_) { /* private mode */ }
  updateThemeIcon();
  if (D) renderAll();
}

/* ── plotly helpers ────────────────────────────────────────────────────── */
const CFG = { displaylogo: false, responsive: true,
  modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"] };

function baseLayout(extra = {}) {
  const ink = css("--ink"), ink2 = css("--ink-secondary") || css("--ink-2"), grid = css("--grid"), axis = css("--axis");
  return Object.assign({
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif", size: 11.5, color: ink2 },
    margin: { l: 52, r: 92, t: 42, b: 38 },
    hovermode: "x unified",
    hoverlabel: {
      bgcolor: css("--surface-0") || css("--surface-1"),
      bordercolor: css("--border") || axis,
      font: { family: "'Plus Jakarta Sans', system-ui, sans-serif", color: ink, size: 12 }
    },
    showlegend: false,
    xaxis: { gridcolor: grid, zeroline: false, linecolor: axis, tickcolor: axis },
    yaxis: { gridcolor: grid, zeroline: false, linecolor: axis, tickcolor: axis },
  }, extra);
}

function xRange() {
  if (S.range === "cycle") return ["2021-01-01", "2026-09-30"];
  if (S.range === "recent") return ["2023-01-01", "2026-09-30"];
  return ["2016-01-01", "2026-09-30"];
}

/** Phase bands. The 2026 band is hatched and holds no data — it only locates the story. */
function phaseShapes() {
  if (!S.phases) return [];
  const p = D.meta.phases, dark = isDark();
  const band = (x0, x1, color, op) => ({
    type: "rect", xref: "x", yref: "paper", x0, x1, y0: 0, y1: 1,
    fillcolor: color, opacity: op, line: { width: 0 }, layer: "below",
  });
  return [
    band(p.hike[0], p.hike[1], css("--critical"), dark ? 0.14 : 0.08),
    band(p.ease[0], p.ease[1], css("--good"), dark ? 0.14 : 0.08),
    Object.assign(band(p.risk[0], p.risk[1], css("--muted"), dark ? 0.16 : 0.1),
      { line: { width: 1, color: css("--muted"), dash: "dot" } }),
  ];
}

function phaseAnnotations() {
  if (!S.phases) return [];
  const m = css("--muted");
  const tag = (x, y, text, color) => ({
    x, y, xref: "x", yref: "paper", text, showarrow: false,
    font: { size: 10, color: color || m, family: "'Plus Jakarta Sans', sans-serif", weight: 600 },
    xanchor: "left",
  });
  return [
    tag("2022-03-01", 1.045, "hiking 03/2022"),
    tag("2024-09-01", 1.045, "Fed cắt 09/2024"),
    tag("2025-09-01", 1.155, "2026 · chưa có dữ liệu", css("--critical")),
  ];
}

/** Right-hand direct labels */
function endLabels(traces) {
  const pts = traces.map((t) => {
    let i = t.y.length - 1;
    while (i >= 0 && (t.y[i] === null || t.y[i] === undefined)) i--;
    return i < 0 ? null : { x: t.x[i], y: t.y[i], name: t.name, color: t.line.color };
  }).filter(Boolean);
  if (!pts.length) return [];

  const all = traces.flatMap((t) => t.y).filter((v) => v !== null && v !== undefined);
  const gap = (Math.max(...all) - Math.min(...all)) * 0.052;
  pts.sort((a, b) => a.y - b.y);
  const ys = pts.map((p) => p.y);
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);

  return pts.map((p, i) => ({
    x: p.x, y: ys[i], text: "  " + p.name, showarrow: false, xanchor: "left",
    font: { size: 11, color: p.color, weight: 700, family: "'Plus Jakarta Sans', sans-serif" },
  }));
}

function colsFor(elId, n, minW) {
  const el = document.getElementById(elId);
  const w = (el && el.clientWidth) || 900;
  return Math.max(1, Math.min(n, Math.floor(w / minW) || 1));
}

function draw(target, traces, layout) {
  const node = typeof target === "string" ? document.getElementById(target) : target;
  if (!node) return;
  Plotly.react(node, traces, layout, CFG);
  Plotly.Plots.resize(node);
}

function lineTrace(name, color, dates, vals, opts = {}) {
  return Object.assign({
    type: "scatter", mode: "lines", name, x: dates, y: vals,
    line: { color, width: opts.width || 2.2, dash: opts.dash },
    hovertemplate: "%{y:.1f}" + (opts.unit || "") + "<extra>" + name + "</extra>",
    connectgaps: false,
  }, opts.extra || {});
}

/* ── KPI tiles with Recovery Progress Meter ──────────────────────────────── */
function renderKPIs() {
  const rec = Object.fromEntries(D.tables.recovery.map((r) => [r.series, r]));
  const cyc = Object.fromEntries(D.tables.cycle.map((r) => [r.cty, r]));
  const cross = Object.fromEntries(D.tables.cross.map((r) => [r.cty, r]));

  $("#kpis").innerHTML = S.countries.map((c) => {
    const r = rec[c + "_P"], k = cyc[c], x = cross[c];
    const above = r.above_bench;
    const cls = above > 4 ? "crit" : above > 0.5 ? "warn" : "ok";
    const txt = above > 4 ? "Rủi ro cao" : above > 0.5 ? "Còn căng" : "Đã phục hồi";
    
    // Progress meter calculation
    let meterHtml = "";
    if (r.repaid !== null) {
      const pct = Math.min(100, Math.max(0, parseFloat(r.repaid)));
      meterHtml = `
        <div class="meter-box">
          <div class="meter-label">
            <span>Đã gỡ phần vượt mốc</span>
            <b>${r.repaid}%</b>
          </div>
          <div class="meter-bar">
            <div class="meter-fill" style="width:${pct}%;background:${above <= 0 ? 'var(--good)' : 'var(--k)'}"></div>
          </div>
        </div>
      `;
    } else {
      meterHtml = `
        <div class="meter-box">
          <div class="meter-label">
            <span>Trạng thái vượt mốc</span>
            <b style="color:var(--good)">Chưa từng vượt mốc</b>
          </div>
          <div class="meter-bar">
            <div class="meter-fill" style="width:100%;background:var(--good)"></div>
          </div>
        </div>
      `;
    }

    return `<div class="kpi" style="--k:${colorOf(c)}">
      <div class="name">
        <span class="name-dot"></span>
        <span>${FLAGS[c] || ""} ${D.meta.names[c]}</span>
        <span class="pill ${cls}" style="margin-left:auto">${txt}</span>
      </div>
      <div class="big">${r.now.toFixed(1)}<span>% DSR</span></div>
      <div class="sub">${above >= 0 ? "cao hơn" : "thấp hơn"} mốc 20 năm
        <b>${Math.abs(above).toFixed(1)}pp</b> (mốc ${r.bench.toFixed(1)}%)</div>
      ${meterHtml}
      <div class="row">
        <span>Lãi suất hiện tại</span>
        <div><b>${k.now.toFixed(2)}%</b> <span style="color:var(--muted);font-size:11px">(đỉnh ${k.peak.toFixed(2)}%)</span></div>
      </div>
      <div class="row">
        <span>NPL ${x.last_year}</span>
        <div><b>${x.npl_last.toFixed(2)}%</b> <span style="color:var(--muted);font-size:11px">(${x.d_npl >= 0 ? "+" : ""}${x.d_npl} từ 2021)</span></div>
      </div>
    </div>`;
  }).join("");
}

/* ── charts ────────────────────────────────────────────────────────────── */
function chartDSR() {
  const s = D.series.dsr, traces = [];
  S.countries.forEach((c) => {
    traces.push(lineTrace(D.meta.names[c], colorOf(c), s.dates, s.cols[c + "_P"], { unit: "%" }));
  });
  if (S.krSplit && S.countries.includes("KR")) {
    traces.push(lineTrace("HQ · Hộ gia đình", colorOf("KR"), s.dates, s.cols.KR_H,
      { width: 1.6, dash: "dash", unit: "%" }));
    traces.push(lineTrace("HQ · Doanh nghiệp", colorOf("KR"), s.dates, s.cols.KR_N,
      { width: 1.6, dash: "dot", unit: "%" }));
  }
  draw("c-dsr", traces, baseLayout({
    shapes: phaseShapes(),
    annotations: phaseAnnotations().concat(endLabels(traces)),
    xaxis: Object.assign(baseLayout().xaxis, { range: xRange() }),
    yaxis: Object.assign(baseLayout().yaxis, { title: { text: "% thu nhập", font: { size: 11 } } }),
  }));

  const only = S.countries.filter((c) => !D.meta.has_breakdown.includes(c));
  $("#dsr-warn").innerHTML = only.length
    ? `⚠ BIS <b>chỉ</b> công bố DSR tổng PNFS cho ${only.map((c) => D.meta.names[c]).join(", ")} — không có breakdown Hộ gia đình / Doanh nghiệp. Không suy đoán, không nội suy.`
    : "";
  $("#dsr-warn").hidden = only.length === 0;
}

function chartGap(el, rangeOverride) {
  const s = D.series.dsr_gap;
  const traces = S.countries.map((c) =>
    lineTrace(D.meta.names[c], colorOf(c), s.dates, s.cols[c + "_P"], { unit: "pp" }));
  const lay = baseLayout({
    shapes: phaseShapes().concat([{
      type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 0, y1: 0,
      line: { color: css("--axis"), width: 1.5 },
    }]),
    annotations: phaseAnnotations().concat(endLabels(traces)),
    xaxis: Object.assign(baseLayout().xaxis, { range: rangeOverride || xRange() }),
    yaxis: Object.assign(baseLayout().yaxis, {
      title: { text: "pp so với trung bình 2006–2025", font: { size: 11 } } }),
  });
  draw(el, traces, lay);
}

function chartCredit() {
  const s = D.series.credit;
  const traces = S.countries.map((c) =>
    lineTrace(D.meta.names[c], colorOf(c), s.dates, s.cols[c + "_" + S.borrower], { unit: "% GDP" }));
  draw("c-credit", traces, baseLayout({
    shapes: phaseShapes(),
    annotations: phaseAnnotations().concat(endLabels(traces)),
    xaxis: Object.assign(baseLayout().xaxis, { range: xRange() }),
    yaxis: Object.assign(baseLayout().yaxis, { title: { text: "% GDP", font: { size: 11 } } }),
  }));
  $("#bor-tag").textContent = D.meta.borrower[S.borrower];
}

function chartPolicy(el) {
  const s = D.series.policy;
  const traces = S.countries.map((c) =>
    lineTrace(D.meta.names[c], colorOf(c), s.dates, s.cols[c], { unit: "%", extra: { line_shape: "hv" } }));
  traces.forEach((t) => { t.line.shape = "hv"; });
  const us = lineTrace("Mỹ (Fed)", colorOf("US"), s.dates, s.cols.US, { unit: "%", width: 1.8, dash: "dash" });
  us.line.shape = "hv";
  traces.push(us);
  draw(el, traces, baseLayout({
    shapes: phaseShapes(),
    annotations: phaseAnnotations().concat(endLabels(traces)),
    xaxis: Object.assign(baseLayout().xaxis, { range: xRange() }),
    yaxis: Object.assign(baseLayout().yaxis, { title: { text: "% / năm", font: { size: 11 } } }),
  }));
}

function chartLagCorr() {
  const rows = D.tables.corr.filter((r) => S.countries.includes(r.cty));
  const cols = colsFor("c-lag", Math.min(3, rows.length), 205);
  const rowsN = Math.ceil(rows.length / cols);
  const traces = [], ann = [];
  rows.forEach((r, i) => {
    const ax = i === 0 ? "" : i + 1;
    traces.push({
      type: "bar", x: r.values.map((_, k) => k), y: r.values,
      marker: { color: r.values.map((_, k) => k === r.best ? colorOf(r.cty) : css("--grid")) },
      xaxis: "x" + ax, yaxis: "y" + ax, showlegend: false,
      hovertemplate: "lag %{x} quý: r = %{y:.2f}<extra>" + r.label + "</extra>",
    });
    ann.push({ text: r.label, xref: "x" + ax + " domain", yref: "y" + ax + " domain",
      x: 0, y: 1.16, showarrow: false, xanchor: "left",
      font: { size: 11, color: css("--ink"), weight: 700 } });
    ann.push({ text: `đỉnh ${r.best} quý (${r.best * 3} th.) · r = ${r.best_r >= 0 ? "+" : ""}${r.best_r.toFixed(2)}`,
      xref: "x" + ax + " domain", yref: "y" + ax + " domain",
      x: 0.02, y: r.values[0] < 0 ? 0.96 : 0.04, showarrow: false, xanchor: "left",
      yanchor: r.values[0] < 0 ? "top" : "bottom",
      font: { size: 10, color: css("--ink-2"), weight: 700 } });
  });
  const lay = baseLayout({
    grid: { rows: rowsN, columns: cols, pattern: "independent", ygap: 0.42, xgap: 0.1 },
    margin: { l: 44, r: 12, t: 30, b: 34 }, hovermode: "closest", annotations: ann, bargap: 0.28,
  });
  rows.forEach((_, i) => {
    const k = i === 0 ? "" : i + 1;
    lay["xaxis" + k] = { gridcolor: "rgba(0,0,0,0)", zeroline: false, linecolor: css("--axis"),
      tickcolor: css("--axis"), dtick: 1, tickfont: { size: 9.5 } };
    lay["yaxis" + k] = { gridcolor: css("--grid"), range: [-0.78, 0.78], zeroline: true,
      zerolinecolor: css("--axis"), linecolor: "rgba(0,0,0,0)", tickfont: { size: 9.5 }, dtick: 0.4 };
  });
  document.getElementById("c-lag").style.height = (rowsN > 2 ? 150 * rowsN : 330) + "px";
  draw("c-lag", traces, lay);
}

function chartLagBars(el) {
  const rows = D.tables.lag.slice().sort((a, b) => a.lag_months - b.lag_months);
  const traces = [{
    type: "bar", orientation: "h", y: rows.map((r) => r.label), x: rows.map((r) => r.lag_months),
    marker: { color: rows.map((r) => r.fits ? css("--good") : colorOf(r.cty)) },
    text: rows.map((r) => `${r.lag_months} th.`), textposition: "outside",
    textfont: { size: 10.5, color: css("--ink-2") },
    hovertemplate: "%{y}<br>tăng lãi suất %{customdata[0]} → đỉnh DSR %{customdata[1]}"
      + "<br>độ trễ %{x} tháng · DSR +%{customdata[2]}pp<extra></extra>",
    customdata: rows.map((r) => [r.start, r.peak_q, r.rise]),
  }];
  const lay = baseLayout({
    margin: { l: 168, r: 40, t: 26, b: 34 }, hovermode: "closest",
    shapes: [{ type: "rect", xref: "x", yref: "paper", x0: 12, x1: 18, y0: 0, y1: 1,
      fillcolor: css("--good"), opacity: 0.1, line: { width: 0 }, layer: "below" }],
    annotations: [{ x: 15, y: 1.07, xref: "x", yref: "paper", text: "giả thuyết 12–18 tháng",
      showarrow: false, font: { size: 10, color: css("--good"), weight: 700 } }],
    xaxis: Object.assign(baseLayout().xaxis, {
      title: { text: "tháng từ lần tăng lãi suất đầu tiên đến đỉnh DSR", font: { size: 11 } },
      range: [0, 42] }),
    yaxis: { gridcolor: "rgba(0,0,0,0)", linecolor: "rgba(0,0,0,0)", tickfont: { size: 11 } },
  });
  draw(el, traces, lay);
}

function chartNPL(el) {
  const cs = S.countries;
  const cols = colsFor(el, Math.min(2, cs.length), 230), rowsN = Math.ceil(cs.length / cols);
  const d = D.series.dsr, n = D.series.npl, traces = [], ann = [];
  const yearEnd = d.dates.map((x, i) => [x, i]).filter(([x]) => x.slice(5, 7) === "12");

  cs.forEach((c, i) => {
    const ax = i === 0 ? "" : i + 1;
    const dv = yearEnd.map(([, i2]) => d.cols[c + "_P"][i2]);
    const dx = yearEnd.map(([x]) => x);
    const base = dv[0];
    const nv = n.cols[c], nb = nv[0];
    traces.push({ type: "scatter", mode: "lines", x: dx, y: dv.map((v) => v / base * 100),
      line: { color: colorOf(c), width: 2.2 }, xaxis: "x" + ax, yaxis: "y" + ax, showlegend: false,
      hovertemplate: "DSR: %{y:.0f}<extra></extra>", name: "DSR" });
    traces.push({ type: "scatter", mode: "lines+markers", x: n.dates,
      y: nv.map((v) => v === null ? null : v / nb * 100),
      line: { color: css("--ink-2"), width: 1.6, dash: "dash" }, marker: { size: 5 },
      xaxis: "x" + ax, yaxis: "y" + ax, showlegend: false, connectgaps: false,
      hovertemplate: "NPL: %{y:.0f}<extra></extra>", name: "NPL" });
    ann.push({ text: D.meta.names[c], xref: "x" + ax + " domain", yref: "y" + ax + " domain",
      x: 0, y: 1.14, showarrow: false, xanchor: "left",
      font: { size: 11, color: css("--ink"), weight: 700 } });
    const miss = D.tables.cross.find((r) => r.cty === c).missing;
    if (miss.length) {
      ann.push({ text: "NPL thiếu " + miss.join(", "), xref: "x" + ax + " domain",
        yref: "y" + ax + " domain", x: 0.98, y: 0.04, showarrow: false, xanchor: "right",
        font: { size: 9.5, color: css("--critical") } });
    }
  });
  const lay = baseLayout({
    grid: { rows: rowsN, columns: cols, pattern: "independent", ygap: 0.34, xgap: 0.12 },
    margin: { l: 46, r: 14, t: 28, b: 30 }, hovermode: "x unified", annotations: ann,
  });
  cs.forEach((_, i) => {
    const k = i === 0 ? "" : i + 1;
    lay["xaxis" + k] = { gridcolor: css("--grid"), linecolor: css("--axis"), tickfont: { size: 9.5 }, nticks: 5 };
    lay["yaxis" + k] = { gridcolor: css("--grid"), linecolor: "rgba(0,0,0,0)", tickfont: { size: 9.5 },
      title: { text: "2016 = 100", font: { size: 9.5 } } };
  });
  draw(el, traces, lay);

  const gaps = D.tables.cross.filter((r) => cs.includes(r.cty) && r.missing.length);
  $("#npl-warn").hidden = gaps.length === 0;
  $("#npl-warn").innerHTML = gaps.length
    ? "⚠ World Bank chưa công bố NPL: " + gaps.map((g) => `${g.name} (${g.missing.join(", ")})`).join(" · ")
      + ". Để trống, <b>không nội suy</b>."
    : "";
}

function chartSurprise(el) {
  const rows = D.tables.surprise.filter((r) => S.countries.includes(r.cty));
  const labels = rows.map((r) => `${r.name}<br><span style="font-size:9px">đỉnh ${r.peak_q}</span>`);
  const traces = [
    { type: "bar", orientation: "h", name: "Δ DSR (pp)", y: labels, x: rows.map((r) => r.d_dsr),
      marker: { color: css("--kr") }, text: rows.map((r) => (r.d_dsr >= 0 ? "+" : "") + r.d_dsr),
      textposition: "outside", textfont: { size: 10, color: css("--ink-2") },
      hovertemplate: "Δ DSR %{x:+.1f}pp<extra></extra>" },
    { type: "bar", orientation: "h", name: "Δ Dư nợ/GDP (pp)", y: labels, x: rows.map((r) => r.d_credit),
      marker: { color: css("--th") }, text: rows.map((r) => (r.d_credit >= 0 ? "+" : "") + r.d_credit),
      textposition: "outside", textfont: { size: 10, color: css("--ink-2") },
      hovertemplate: "Δ Dư nợ/GDP %{x:+.1f}pp<extra></extra>" },
  ];
  const lo = Math.min(...rows.flatMap((r) => [r.d_dsr, r.d_credit, 0]));
  const hi = Math.max(...rows.flatMap((r) => [r.d_dsr, r.d_credit, 0]));
  const pad = (hi - lo) * 0.34;
  const lay = baseLayout({
    barmode: "group", bargap: 0.32, bargroupgap: 0.08, hovermode: "closest",
    margin: { l: 118, r: 128, t: 20, b: 40 }, showlegend: true,
    legend: { orientation: "h", y: -0.18, x: 0, font: { size: 10.5 } },
    annotations: rows.map((r, i) => ({
      x: hi + pad * 0.42, y: labels[i], xref: "x", yref: "y",
      text: r.fits ? "✓ khớp giả thuyết" : "✗ không khớp", showarrow: false, xanchor: "left",
      font: { size: 10, color: r.fits ? css("--critical") : css("--muted"), weight: 700 },
    })),
    xaxis: Object.assign(baseLayout().xaxis, {
      range: [lo - pad * 0.35, hi + pad * 1.5], zeroline: true, zerolinecolor: css("--axis"),
      title: { text: "thay đổi từ 2021-Q4 đến quý DSR đạt đỉnh (pp)", font: { size: 11 } } }),
    yaxis: { gridcolor: "rgba(0,0,0,0)", linecolor: "rgba(0,0,0,0)", tickfont: { size: 10.5 } },
  });
  draw(el, traces, lay);
}

function chartRecovery(el) {
  const rows = D.tables.recovery.filter((r) => S.countries.includes(r.cty))
    .slice().sort((a, b) => a.above_bench - b.above_bench);
  const traces = [{
    type: "bar", orientation: "h", y: rows.map((r) => r.label), x: rows.map((r) => r.above_bench),
    marker: { color: rows.map((r) => r.above_bench > 4 ? css("--critical")
      : r.above_bench > 0.5 ? css("--serious") : css("--good")) },
    text: rows.map((r) => (r.above_bench >= 0 ? "+" : "") + r.above_bench.toFixed(1) + "pp"
      + (r.repaid === null ? " · chưa từng vượt mốc" : ` · gỡ ${r.repaid}%`)),
    textposition: "outside", textfont: { size: 10.5, color: css("--ink-2") },
    hovertemplate: "2025-Q4: %{customdata[0]}%<br>mốc 20 năm: %{customdata[1]}%"
      + "<br>còn vượt: %{x:+.1f}pp<extra>%{y}</extra>",
    customdata: rows.map((r) => [r.now.toFixed(1), r.bench.toFixed(1)]),
  }];
  const hi = Math.max(...rows.map((r) => r.above_bench), 1);
  const lo = Math.min(...rows.map((r) => r.above_bench), 0);
  const lay = baseLayout({
    margin: { l: 176, r: 96, t: 20, b: 40 }, hovermode: "closest", bargap: 0.4,
    xaxis: Object.assign(baseLayout().xaxis, {
      range: [lo - 1.2, hi + 2.6], zeroline: true, zerolinecolor: css("--axis"),
      title: { text: "2025-Q4 còn cao hơn mốc 20 năm bao nhiêu (pp)", font: { size: 11 } } }),
    yaxis: { gridcolor: "rgba(0,0,0,0)", linecolor: "rgba(0,0,0,0)", tickfont: { size: 10.5 } },
  });
  draw(el, traces, lay);
}

function chartMix(el) {
  const s = D.series.credit, last = s.dates.length - 1;
  const cs = D.meta.order;
  const traces = [
    { type: "bar", name: "Hộ gia đình", x: cs.map((c) => D.meta.names[c]),
      y: cs.map((c) => s.cols[c + "_H"][last]), marker: { color: css("--kr") },
      hovertemplate: "%{y:.1f}% GDP<extra>Hộ gia đình</extra>" },
    { type: "bar", name: "Doanh nghiệp", x: cs.map((c) => D.meta.names[c]),
      y: cs.map((c) => s.cols[c + "_N"][last]), marker: { color: css("--th") },
      hovertemplate: "%{y:.1f}% GDP<extra>Doanh nghiệp</extra>" },
  ];
  draw(el, traces, baseLayout({
    barmode: "group", bargap: 0.38, bargroupgap: 0.08, hovermode: "closest", showlegend: true,
    legend: { orientation: "h", y: -0.16, x: 0, font: { size: 10.5 } },
    margin: { l: 52, r: 16, t: 16, b: 54 },
    yaxis: Object.assign(baseLayout().yaxis, { title: { text: "% GDP", font: { size: 11 } } }),
  }));
}

/* ── tables ────────────────────────────────────────────────────────────── */
const TABLE_NOTE = {
  dsr: "DSR (% thu nhập trả gốc + lãi), theo quý. BIS WS_DSR 1.0.",
  dsr_gap: "DSR trừ đi mức trung bình 20 năm (2006-Q1→2025-Q4) của chính nước đó, theo quý.",
  credit: "Dư nợ tín dụng / GDP (%), theo quý. BIS WS_TC 2.0, UNIT_TYPE=770.",
  policy: "Lãi suất chính sách (%/năm), cuối kỳ, theo tháng. BIS WS_CBPOL 1.0.",
  npl: "NPL / tổng dư nợ gộp (%), theo năm. World Bank FB.AST.NPER.ZS. Ô trống = chưa công bố.",
};

function currentTable() {
  const s = D.series[S.table];
  const keep = Object.keys(s.cols).filter((k) => {
    if (S.table === "policy") return S.countries.includes(k) || k === "US";
    if (S.table === "npl") return S.countries.includes(k);
    return S.countries.includes(k.slice(0, 2));
  });
  return { dates: s.dates, keep, cols: s.cols };
}

function renderTable() {
  const { dates, keep, cols } = currentTable();
  $("#table-note").textContent = TABLE_NOTE[S.table];
  const q = ($("#table-search")?.value || "").trim().toLowerCase();

  const head = `<thead><tr><th>Kỳ</th>${keep.map((k) => `<th>${k}</th>`).join("")}</tr></thead>`;
  
  const filteredIndices = dates.map((d, i) => i).filter((i) => {
    if (!q) return true;
    const d = dates[i];
    if (d.toLowerCase().includes(q)) return true;
    return keep.some((k) => cols[k][i] !== null && String(cols[k][i]).includes(q));
  });

  const body = filteredIndices.reverse().map((i) => {
    const d = dates[i];
    return `<tr><td>${d}</td>${keep.map((k) =>
      `<td>${cols[k][i] === null ? "—" : cols[k][i].toFixed(2)}</td>`).join("")}</tr>`;
  }).join("");

  $("#table").innerHTML = head + "<tbody>" + (body || `<tr><td colspan="${keep.length + 1}" style="text-align:center;padding:18px;color:var(--muted)">Không tìm thấy kết quả phù hợp với từ khóa "${q}"</td></tr>`) + "</tbody>";
}

function downloadCSV() {
  const { dates, keep, cols } = currentTable();
  const lines = ["date," + keep.join(",")];
  dates.forEach((d, i) => lines.push(d + "," + keep.map((k) =>
    cols[k][i] === null ? "" : cols[k][i]).join(",")));
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `bis_${S.table}_2016_2025.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function renderCoverage() {
  const rows = D.tables.coverage;
  $("#cov").innerHTML =
    `<thead><tr><th>Bộ dữ liệu</th><th>Chuỗi</th><th>Tần suất</th><th>Số kỳ</th>
       <th>Có giá trị</th><th>% thiếu</th></tr></thead><tbody>` +
    rows.map((r) => `<tr><td>${r.dataset}</td><td>${r.series}</td><td>${r.freq}</td>
      <td>${r.n}</td><td>${r.valid}</td>
      <td style="color:${r.missing_pct > 0 ? css("--critical") : "inherit"};font-weight:${r.missing_pct > 0 ? 700 : 400}">${r.missing_pct}%</td></tr>`).join("") +
    "</tbody>";
}

/* ── story numbers ─────────────────────────────────────────────────────── */
function fillStoryNumbers() {
  const rec = Object.fromEntries(D.tables.recovery.map((r) => [r.cty + "_" + r.series.slice(3), r]));
  const R = (c) => D.tables.recovery.find((r) => r.series === c + "_P");
  const C = (c) => D.tables.cycle.find((r) => r.cty === c);
  const X = (c) => D.tables.cross.find((r) => r.cty === c);
  const lags = D.tables.lag.map((r) => r.lag_months).sort((a, b) => a - b);
  const mid = lags.length % 2 ? lags[(lags.length - 1) / 2]
    : (lags[lags.length / 2 - 1] + lags[lags.length / 2]) / 2;

  const V = {
    hk_now: R("HK").now.toFixed(1),
    hk_gap: "+" + R("HK").above_bench.toFixed(1),
    hk_repaid: R("HK").repaid,
    th_now: R("TH").now.toFixed(1),
    th_gap_abs: Math.abs(R("TH").above_bench).toFixed(1),
    th_rate: C("TH").now.toFixed(2),
    hk_hike: "+" + C("HK").total_hike.toFixed(2),
    kr_hike: "+" + C("KR").total_hike.toFixed(2),
    th_hike: "+" + C("TH").total_hike.toFixed(2),
    my_hike: "+" + C("MY").total_hike.toFixed(2),
    lag_fits: D.tables.lag.filter((r) => r.fits).length,
    lag_median: mid,
    kr_corr: X("KR").corr_level.toFixed(2),
    th_corr: X("TH").corr_level.toFixed(2),
    surp_fits: D.tables.surprise.filter((r) => r.fits).length,
  };
  $$("[data-v]").forEach((el) => { el.textContent = V[el.dataset.v]; });
}

/* ── chart category filtering ──────────────────────────────────────────── */
function applyChartCategory(cat) {
  S.cat = cat;
  $$("#charts-grid .card").forEach((c) => {
    const ccat = c.dataset.cat;
    if (cat === "all" || ccat === cat) {
      c.style.display = "";
    } else {
      c.style.display = "none";
    }
  });
  // Debounced resize to fix dimensions of newly unhidden charts
  setTimeout(() => {
    $$("#charts-grid .chart").forEach((el) => {
      if (el.offsetParent) Plotly.Plots.resize(el);
    });
  }, 60);
}

/* ── orchestration ─────────────────────────────────────────────────────── */
function renderAll() {
  renderKPIs();
  chartDSR();
  chartGap("c-gap");
  chartCredit();
  chartPolicy("c-policy");
  chartLagCorr();
  chartNPL("c-npl");
  chartSurprise("c-surprise");
  chartRecovery("c-recovery");
  renderTable();
  renderCoverage();
  applyChartCategory(S.cat);
  if (!$("#view-story").hidden) renderStoryCharts();
}

let storyDrawn = false;
function renderStoryCharts() {
  const saved = S.countries;
  S.countries = D.meta.order;
  chartGap("s-gap", ["2016-01-01", "2026-09-30"]);
  chartPolicy("s-policy");
  chartLagBars("s-lag");
  chartNPL("s-npl");
  chartSurprise("s-surprise");
  chartRecovery("s-recovery");
  chartMix("s-mix");
  S.countries = saved;
  storyDrawn = true;
}

function wire() {
  // country chips with flags
  $("#chips").innerHTML = D.meta.order.map((c) =>
    `<button class="chip" data-c="${c}" aria-pressed="true"><span class="dot"></span><span>${FLAGS[c] || ""} ${D.meta.names[c]}</span></button>`
  ).join("");

  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    const c = b.dataset.c;
    const on = b.getAttribute("aria-pressed") === "true";
    if (on && S.countries.length === 1) return;      // never leave the view empty
    b.setAttribute("aria-pressed", String(!on));
    S.countries = D.meta.order.filter((k) =>
      $(`.chip[data-c="${k}"]`).getAttribute("aria-pressed") === "true");
    renderAll();
  });

  // Quick select all / clear
  $("#btn-all-countries")?.addEventListener("click", () => {
    S.countries = [...D.meta.order];
    $$(".chip[data-c]").forEach((b) => b.setAttribute("aria-pressed", "true"));
    renderAll();
  });

  $("#btn-clear-countries")?.addEventListener("click", () => {
    S.countries = ["KR"]; // keep Korea
    $$(".chip[data-c]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.c === "KR")));
    renderAll();
  });

  // Chart category tabs
  $$("#chart-cats .cat-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("#chart-cats .cat-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      applyChartCategory(btn.dataset.cat);
    });
  });

  // Segment buttons
  const seg = (sel, key, attr) => $(sel)?.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $$(sel + " button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    S[key] = b.dataset[attr];
    renderAll();
  });
  seg("#range", "range", "r");
  seg("#borrower", "borrower", "b");
  seg("#tableset", "table", "t");

  // Explainer accordion toggle
  const expToggle = $("#explainer-toggle");
  const expContent = $("#explainer-content");
  const expArrow = $("#explainer-arrow");
  if (expToggle && expContent) {
    expToggle.addEventListener("click", () => {
      const isClosed = expContent.style.display === "none";
      expContent.style.display = isClosed ? "grid" : "none";
      if (expArrow) expArrow.textContent = isClosed ? "▼" : "▲";
    });
  }

  // Table search
  $("#table-search")?.addEventListener("input", renderTable);

  $("#phases").addEventListener("change", (e) => { S.phases = e.target.checked; renderAll(); });
  $("#kr-split").addEventListener("change", (e) => { S.krSplit = e.target.checked; chartDSR(); });
  $("#dl").addEventListener("click", downloadCSV);
  $("#theme").addEventListener("click", () => setTheme(isDark() ? "light" : "dark"));

  // Tab switcher
  const show = (story) => {
    $("#view-dash").hidden = story;
    $("#view-story").hidden = !story;
    $("#tab-dash").setAttribute("aria-selected", String(!story));
    $("#tab-story").setAttribute("aria-selected", String(story));
    window.scrollTo({ top: 0 });
    if (story) renderStoryCharts(); else renderAll();
  };
  $("#tab-dash").addEventListener("click", () => show(false));
  $("#tab-story").addEventListener("click", () => show(true));

  // Window resize debounce
  let rt = null;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if ($("#view-story").hidden) renderAll(); else renderStoryCharts();
      $$(".chart").forEach((el) => { if (el.offsetParent) Plotly.Plots.resize(el); });
    }, 180);
  });

  // Reading progress scroll handler
  window.addEventListener("scroll", () => {
    const bar = $("#read-progress");
    if (!bar) return;
    const total = document.documentElement.scrollHeight - window.innerHeight;
    if (total > 0) {
      const pct = Math.min(100, Math.max(0, (window.scrollY / total) * 100));
      bar.style.width = pct + "%";
    }
  }, { passive: true });
}

fetch("data.json")
  .then((r) => r.json())
  .then((json) => {
    D = json;
    try {
      const t = localStorage.getItem("theme");
      if (t) document.documentElement.dataset.theme = t;
    } catch (_) { /* private mode: stay on default */ }
    updateThemeIcon();
    $("#src").textContent = "Nguồn: " + D.meta.source;
    if (D.meta.updated_at) {
      const pText = $("#pipeline-status-text");
      if (pText) pText.innerHTML = `Tự động 09:00 · <span style="font-weight:400;opacity:0.85">${D.meta.updated_at}</span>`;
      const fText = $("#foot-updated-at");
      if (fText) fText.textContent = D.meta.updated_at;
    }
    wire();
    fillStoryNumbers();
    renderAll();
  })
  .catch((err) => {
    document.body.insertAdjacentHTML("afterbegin",
      `<div class="wrap" style="padding:30px;color:#ef4444">
        <b>Không tải được data.json</b><br>Chạy <code>python product/build_site.py</code> trước,
        rồi mở trang qua <code>python product/serve.py</code> (không mở file:// trực tiếp).
        <br><small>${err}</small></div>`);
  });
