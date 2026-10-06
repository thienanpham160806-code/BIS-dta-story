// Every chart on the site. One shared Plotly template; titles state the finding and
// are computed from data.json, never typed.
import { $, css, esc, vn, expand, clip, lastValid, median, periodLabel, qLabel, listJoin } from "./util.js";
import { colorOf } from "./state.js";

const MAX_LINES = 6;                         // above this, line charts become small multiples
const BORROWER = { P: "khu vực tư nhân (P)", H: "hộ gia đình (H)", N: "doanh nghiệp (N)" };
export const BORROWER_SHORT = { P: "P", H: "H", N: "N" };
const CFG = { displayModeBar: false, responsive: true, displaylogo: false };

/* ------------------------------------------------------------------ template */
/** Fresh layout every call: Plotly mutates the objects it is given. */
export function plotTemplate() {
  const font = css("--font-ui");
  const axis = () => ({
    gridcolor: css("--chart-grid"), linecolor: css("--chart-axis"), zerolinecolor: css("--ink-2"), zerolinewidth: 1,
    tickfont: { color: css("--ink-2"), size: 12 }, title: { font: { color: css("--ink-2"), size: 12 } },
    automargin: true, fixedrange: true,
  });
  return {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: font, size: 12.5, color: css("--ink-2") },
    separators: ",.",
    margin: { l: 8, r: 12, t: 8, b: 8 },
    xaxis: { ...axis(), showgrid: false, showline: true, ticks: "outside", ticklen: 4, tickcolor: css("--chart-axis") },
    yaxis: { ...axis(), zeroline: false },
    hoverlabel: { bgcolor: css("--surface"), bordercolor: css("--rule-2"), font: { family: font, color: css("--ink"), size: 13 }, align: "left" },
    hovermode: "closest", showlegend: false, dragmode: false,
  };
}

function purge(el) { if (window.Plotly && el._fullLayout) window.Plotly.purge(el); el.innerHTML = ""; }

export function emptyState(el, title, hint = "", action = null) {
  purge(el);
  el.innerHTML = `<div class="empty"><strong>${esc(title)}</strong>${hint ? `<span>${esc(hint)}</span>` : ""}${
    action ? `<div><button class="btn" type="button" data-action="${action.id}">${esc(action.label)}</button></div>` : ""}</div>`;
}

function plot(el, traces, layout, extra = {}, onClick = null) {
  if (el.querySelector(".skeleton, .empty, .sm-grid")) el.innerHTML = "";
  const first = !el.dataset.drawn;
  el.classList.remove("draw-in", "refresh");
  void el.offsetWidth;                                    // restart the CSS animation
  el.classList.add(first ? "draw-in" : "refresh");
  el.dataset.drawn = "1";
  const p = window.Plotly.react(el, traces, layout, { ...CFG, ...extra });
  if (el.removeAllListeners) el.removeAllListeners("plotly_click");
  if (onClick && el.on) el.on("plotly_click", (ev) => { const k = onClick(ev.points?.[0]); if (k) clickCountry(k); });
  return p;
}

/** Charts call this with an ISO2 code; main.js decides what opening a country means. */
let countryHandler = null;
export const onCountryClick = (fn) => { countryHandler = fn; };
const clickCountry = (k) => countryHandler?.(k);

/** Push end labels apart so two lines ending close together stay readable. */
function declutter(items, span, gapFrac = 0.075) {
  const gap = span * gapFrac;
  const s = [...items].sort((a, b) => a.y - b.y);
  for (let i = 1; i < s.length; i++) if (s[i].y - s[i - 1].y < gap) s[i].ly = Math.max(s[i].y, (s[i - 1].ly ?? s[i - 1].y) + gap);
  s.forEach((it) => { it.ly = it.ly ?? it.y; });
  return s;
}

/* ------------------------------------------------------------------ time series */
/**
 * Lines for the selected economies (direct-labelled), or small multiples when there
 * are more than MAX_LINES. Returns {have, missing} so callers can write notes.
 */
export function timeSeries(el, ctx, o) {
  const { I, s, slots } = ctx;
  const rows = o.groups ?? s.c.map((k) => ({ keys: [k], label: I.C[k].vi, color: colorOf(slots, k), slot: slots[k] }));
  const data = rows.map((r) => {
    const raw = o.get(r.keys[0]);
    const pts = raw ? clip(expand(raw, o.freq), s.from, s.to) : { x: [], y: [] };
    return { ...r, pts, last: lastValid(pts) };
  });
  const have = data.filter((d) => d.last);
  const missing = data.filter((d) => !d.last);
  if (!have.length) return { have, missing };

  if (rows.length > MAX_LINES) { smallMultiples(el, data, o); return { have, missing, multiples: true }; }

  const traces = [], ann = [], shapes = [];
  have.forEach((d) => {
    const custom = d.pts.x.map((x) => periodLabel(x, o.freq));
    traces.push({
      x: d.pts.x, y: d.pts.y, customdata: custom, type: "scatter",
      mode: o.freq === "A" ? "lines+markers" : "lines", connectgaps: false,
      line: { color: d.color, width: 2.25, shape: o.freq === "M" ? "hv" : "linear" },
      marker: { size: 7, color: d.color, line: { color: css("--surface"), width: 1.5 } },
      name: d.label, meta: d.keys[0],
      hovertemplate: `<b>${esc(d.label)}</b><br>%{customdata}: %{y:${o.hoverFmt}}${o.unit ? " " + o.unit : ""}<extra></extra>`,
    });
  });
  if (o.freq !== "A") traces.push({
    x: have.map((d) => d.last.x), y: have.map((d) => d.last.y), type: "scatter", mode: "markers", hoverinfo: "skip",
    marker: { size: 7, color: have.map((d) => d.color), line: { color: css("--bg"), width: 1.5 } } });
  (o.rings || []).forEach((r) => {
    const d = have.find((h) => h.keys.includes(r.k));
    const i = d ? d.pts.x.indexOf(r.x) : -1;
    if (i >= 0 && d.pts.y[i] !== null) traces.push({
      x: [r.x], y: [d.pts.y[i]], type: "scatter", mode: "markers", customdata: [[d.label, periodLabel(r.x, "Q")]],
      marker: { size: 11, color: css("--bg"), line: { color: d.color, width: 2.2 } },
      hovertemplate: "<b>%{customdata[0]}</b><br>Bắt đầu tăng lãi suất: %{customdata[1]}<extra></extra>" });
  });
  const ys = have.flatMap((d) => d.pts.y.filter((v) => v !== null));
  const span = Math.max(...ys) - Math.min(...ys) || 1;
  declutter(have.map((d) => ({ d, y: d.last.y })), span).forEach(({ d, ly }) => {
    ann.push({ x: d.last.x, y: ly, xanchor: "left", xshift: 8, showarrow: false, align: "left",
      text: `<b>${esc(d.label)}</b> ${o.labelFmt(d.last.y)}`, font: { size: 12.5, color: css("--ink") } });
  });
  (o.vlines || []).forEach((v) => shapes.push({ type: "line", x0: v.x, x1: v.x, yref: "paper", y0: 0, y1: 1,
    line: { color: v.color, width: 1.2, dash: "dot" } }));
  const L = plotTemplate();
  const longest = Math.max(...have.map((d) => (d.label + o.labelFmt(d.last.y)).length));
  L.margin.r = Math.min(170, 18 + longest * 7);
  L.xaxis = { ...L.xaxis, type: "date", tickformat: "%Y", range: [`${s.from}-01-01`, `${s.to}-12-31`], hoverformat: "%Y-%m" };
  L.yaxis = { ...L.yaxis, ticksuffix: o.tickSuffix || "", zeroline: !!o.zero };
  if (o.ylog) L.yaxis.type = "log";
  L.annotations = ann; L.shapes = shapes;
  plot(el, traces, L, {}, (pt) => pt?.data?.meta);
  return { have, missing };
}

function smallMultiples(el, data, o) {
  purge(el);
  const ys = data.flatMap((d) => d.pts.y.filter((v) => v !== null));
  const lo = Math.min(...ys), hi = Math.max(...ys), pad = (hi - lo) * 0.08 || 1;
  el.classList.add("auto");
  el.innerHTML = `<div class="sm-grid">${data.map((d, i) => `
    <div class="sm-cell"><h3><span class="dot" style="background:${d.color}"></span>${esc(d.label)}${
      d.last ? ` <span class="na" style="font-weight:400">${o.labelFmt(d.last.y)}</span>` : ""}</h3>
      ${d.last ? `<div class="sm-plot" id="${el.id}-sm-${i}"></div>` : `<div class="sm-empty">${esc(o.emptyCell)}</div>`}</div>`).join("")}</div>`;
  data.forEach((d, i) => {
    if (!d.last) return;
    const L = plotTemplate();
    L.margin = { l: 4, r: 6, t: 4, b: 4 };
    L.xaxis = { ...L.xaxis, type: "date", tickformat: "%Y", nticks: 4 };
    L.yaxis = { ...L.yaxis, range: o.ylog ? undefined : [lo - pad, hi + pad], nticks: 4, zeroline: !!o.zero, ticksuffix: o.tickSuffix || "" };
    if (o.ylog) L.yaxis.type = "log";
    window.Plotly.newPlot(`${el.id}-sm-${i}`, [{
      x: d.pts.x, y: d.pts.y, customdata: d.pts.x.map((x) => periodLabel(x, o.freq)), type: "scatter",
      mode: o.freq === "A" ? "lines+markers" : "lines", connectgaps: false,
      line: { color: d.color, width: 1.8 }, marker: { size: 5, color: d.color },
      hovertemplate: `<b>${esc(d.label)}</b><br>%{customdata}: %{y:${o.hoverFmt}}${o.unit ? " " + o.unit : ""}<extra></extra>`,
    }], L, CFG);
  });
}

function missingNote(missing, what) {
  if (!missing.length) return "";
  return `<span class="miss">Không có ${esc(what)}:</span> ${esc(listJoin(missing.map((d) => d.label), 8))} — để trống, không ước lượng.`;
}

/* ------------------------------------------------------------------ DSR */
/** Latest gap (within the year range) per selected economy, for borrower b. */
export function latestGaps(ctx) {
  const { I, s } = ctx;
  return s.c.map((k) => {
    const raw = I.D.series.gap[`${k}_${s.b}`];
    const lv = raw ? lastValid(clip(expand(raw, "Q"), s.from, s.to)) : null;
    return lv ? { k, name: I.C[k].vi, gap: lv.y, q: lv.x } : null;
  }).filter(Boolean);
}

export function gapHeadline(ctx) {
  const g = latestGaps(ctx);
  if (!g.length) return null;
  const top = g.reduce((a, b) => (a.gap > b.gap ? a : b));
  const q = qLabel(top.q);
  if (g.length === 1) {
    return `${top.name} ${top.gap >= 0 ? "cao hơn" : "thấp hơn"} mức nền 20 năm ${vn(Math.abs(top.gap))} điểm % (${q})`;
  }
  if (top.gap < 0) return `Cả ${g.length} nền kinh tế đang chọn đều có DSR thấp hơn mức nền 20 năm (${q})`;
  return `${top.name} vẫn cao hơn mức nền 20 năm ${vn(top.gap)} điểm % — cao nhất trong ${g.length} nước đang chọn`;
}

export function renderDSR(ctx) {
  const { I, s } = ctx;
  const el = $("#p-dsr");
  const gap = s.v === "gap";
  const ds = gap ? I.D.series.gap : I.D.series.dsr;
  const rings = s.c.map((k) => ({ k, x: I.lag[`${k}_${s.b}`]?.liftoff_q })).filter((r) => r.x);
  const r = timeSeries(el, ctx, {
    get: (k) => ds[`${k}_${s.b}`], freq: "Q", unit: gap ? "pp so với mức nền" : "% thu nhập",
    hoverFmt: gap ? "+.1f" : ".1f", labelFmt: (v) => (gap ? vn(v, 1, true) : vn(v, 1) + "%"),
    tickSuffix: gap ? " pp" : "%", zero: gap, rings, emptyCell: `Không có DSR ${s.b}`,
  });
  if (!r.have.length) {
    const hint = s.b !== "P" ? `BIS chỉ công bố DSR ${s.b} cho một số nước. Thử nhóm P.` : "Các nước đang chọn không có số liệu DSR trong khoảng năm này.";
    emptyState(el, "Không có dữ liệu cho lựa chọn này", hint, s.b !== "P" ? { id: "borrower-P", label: "Chuyển sang P" } : null);
  }
  const lg = latestGaps(ctx);
  const up = lg.filter((x) => x.gap > 0).length;
  $("#t-dsr").textContent = !gap ? "Mức DSR theo thời gian — chỉ đọc trong từng nước"
    : !lg.length ? "Gánh nặng trả nợ (DSR)"
    : lg.length === 1 ? `${lg[0].name}: DSR ${BORROWER[s.b]} so với mức nền 20 năm qua các năm`
    : up === lg.length ? `Cả ${lg.length} nước đang chọn vẫn có DSR cao hơn mức nền 20 năm`
    : up === 0 ? `Cả ${lg.length} nước đang chọn đều đã xuống dưới mức nền 20 năm`
    : `${up}/${lg.length} nước đang chọn vẫn có DSR cao hơn mức nền 20 năm`;
  $("#d-dsr").textContent = gap
    ? `DSR ${BORROWER[s.b]}, chênh lệch so với trung bình 80 quý gần nhất của chính nước đó.`
    : `DSR ${BORROWER[s.b]}, % thu nhập dành trả gốc + lãi. Mức tuyệt đối không so được giữa các nước — chuyển sang "Độ lệch" để so.`;
  $("#f-dsr").textContent = `Nguồn: BIS WS_DSR 1.0 · Đơn vị: ${gap ? "điểm phần trăm (pp) so với trung bình 80 quý gần nhất của chính nước đó" : "% thu nhập"} · ○ trên đường: quý bắt đầu tăng lãi suất`;
  $("#n-dsr").innerHTML = [missingNote(r.missing, `DSR ${s.b}`), r.multiples ? `Hơn ${MAX_LINES} nước: hiển thị dạng lưới nhỏ, cùng thang trục.` : ""].filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ credit */
export function renderCredit(ctx) {
  const { I, s } = ctx;
  const el = $("#p-credit");
  const r = timeSeries(el, ctx, {
    get: (k) => I.D.series.credit[`${k}_${s.b}`], freq: "Q", unit: "% GDP", hoverFmt: ".1f",
    labelFmt: (v) => vn(v, 0) + "%", tickSuffix: "%", emptyCell: `Không có tín dụng ${s.b}`,
  });
  if (!r.have.length) { emptyState(el, "Không có dữ liệu cho lựa chọn này", "BIS không công bố tín dụng/GDP cho các nước đang chọn."); }
  const ch = r.have.map((d) => {
    const v = d.pts.y.map((y, i) => [d.pts.x[i], y]).filter(([, y]) => y !== null);
    return v.length > 1 ? { d, delta: v.at(-1)[1] - v[0][1], from: v[0][0] } : null;
  }).filter(Boolean);
  if (ch.length) {
    const top = ch.reduce((a, b) => (Math.abs(a.delta) > Math.abs(b.delta) ? a : b));
    $("#t-credit").textContent = `${top.d.label}: tín dụng/GDP ${top.delta >= 0 ? "tăng" : "giảm"} ${vn(Math.abs(top.delta))} điểm % từ ${qLabel(top.from)}${
      ch.length > 1 ? ", nhiều nhất nhóm" : ""}`;
  } else $("#t-credit").textContent = "Tín dụng / GDP";
  $("#d-credit").textContent = `Dư nợ ${BORROWER[s.b]}, % GDP. Đo quy mô nợ, không đo chi phí trả nợ.`;
  $("#n-credit").innerHTML = missingNote(r.missing, `tín dụng ${s.b}`);
}

/* ------------------------------------------------------------------ policy */
export function renderPolicy(ctx) {
  const { I, s, slots } = ctx;
  const el = $("#p-policy");
  // Economies whose mapped series are identical in the window (euro members on the
  // ECB rate) are drawn as one line instead of several overlapping ones.
  const groups = [];
  const sig = new Map();
  s.c.forEach((k) => {
    const raw = I.D.series.policy[k];
    const pts = raw ? clip(expand(raw, "M"), s.from, s.to) : null;
    const key = pts && pts.y.some((v) => v !== null) ? JSON.stringify(pts) : `none-${k}`;
    if (sig.has(key)) sig.get(key).keys.push(k);
    else { const g = { keys: [k] }; sig.set(key, g); groups.push(g); }
  });
  groups.forEach((g) => {
    const names = g.keys.map((k) => I.C[k].vi);
    g.label = g.keys.length > 1 ? `${listJoin(names, 3)} (${g.keys.every((k) => I.C[k].euro) ? "ECB" : "chung"})` : names[0];
    g.color = colorOf(slots, g.keys[0]); g.slot = slots[g.keys[0]];
  });
  const r = timeSeries(el, ctx, {
    groups, get: (k) => I.D.series.policy[k], freq: "M", unit: "%/năm", hoverFmt: ".2f",
    labelFmt: (v) => vn(v, 2) + "%", tickSuffix: "%", emptyCell: "Không có lãi suất chính sách",
  });
  if (!r.have.length) emptyState(el, "Không có dữ liệu cho lựa chọn này", "Các nước đang chọn không có chuỗi lãi suất chính sách trong BIS.");
  const cyc = s.c.map((k) => ({ k, c: I.D.cycles[k] })).filter((x) => x.c?.has_cycle);
  if (cyc.length) {
    const max = Math.max(...cyc.map((x) => x.c.hike_pp));
    const tops = cyc.filter((x) => Math.abs(x.c.hike_pp - max) < 1e-9).map((x) => I.C[x.k].vi);
    const win = `${I.D.meta.cycle_window[0].slice(0, 4)}–${I.D.meta.cycle_window[1].slice(0, 4)}`;
    $("#t-policy").textContent = tops.length > 1
      ? `${listJoin(tops, 3)} cùng tăng lãi suất nhiều nhất trong chu kỳ ${win}: +${vn(max, 2)} điểm %`
      : `${tops[0]} tăng lãi suất nhiều nhất trong chu kỳ ${win}: +${vn(max, 2)} điểm %`;
  } else $("#t-policy").textContent = "Không nước nào đang chọn có chu kỳ tăng lãi suất 2021–2023";
  $("#d-policy").textContent = "Lãi suất điều hành cuối tháng. Các nước dùng chung một lãi suất được gộp thành một đường.";
  const notes = s.c.map((k) => I.C[k]).filter((c) => c.policy_note && !c.euro)
    .map((c) => `<b>${esc(c.vi)}:</b> ${esc(ctx.G?.regime_notes?.[c.iso2] ?? c.policy_note)}`);
  const noCyc = s.c.filter((k) => I.D.cycles[k] && !I.D.cycles[k].has_cycle && I.D.series.policy[k]).map((k) => I.C[k].vi);
  $("#n-policy").innerHTML = [missingNote(r.missing, "lãi suất chính sách"),
    noCyc.length ? `<span class="miss">Không có chu kỳ tăng 2021–2023:</span> ${esc(noCyc.join(", "))}.` : "", ...notes].filter(Boolean).join("<br>");
}

/* ------------------------------------------------------------------ NPL */
export function renderNPL(ctx) {
  const { I, s } = ctx;
  const el = $("#p-npl");
  const r = timeSeries(el, ctx, {
    get: (k) => I.D.series.npl[k], freq: "A", unit: "%", hoverFmt: ".2f",
    labelFmt: (v) => vn(v, 1) + "%", tickSuffix: "%", emptyCell: "World Bank chưa có số NPL",
  });
  if (!r.have.length) emptyState(el, "Không có dữ liệu cho lựa chọn này", "World Bank không có tỷ lệ nợ xấu cho các nước đang chọn trong khoảng năm này.");
  if (r.have.length) {
    const top = r.have.reduce((a, b) => (a.last.y > b.last.y ? a : b));
    $("#t-npl").textContent = `${top.label} có tỷ lệ nợ xấu mới nhất cao nhất: ${vn(top.last.y, 1)}% (${top.last.x.slice(0, 4)})`;
  } else $("#t-npl").textContent = "Nợ xấu (NPL)";
  $("#d-npl").textContent = "Tỷ lệ nợ xấu ngân hàng, số năm — dùng để kiểm tra chéo với DSR.";
  const rows = s.c.map((k) => ({ k, r: I.npl[k] })).filter((x) => x.r);
  const ci = (r, lo, hi) => (Number.isFinite(r) ? `${vn(r, 2, true)} <span class="na">[${Number.isFinite(lo) ? vn(lo, 2) : "—"}; ${Number.isFinite(hi) ? vn(hi, 2) : "—"}]</span>` : "—");
  $("#tbl-npl").innerHTML = rows.length ? `<table class="data"><caption class="sr-only">Tương quan biến động năm giữa NPL và DSR (P)</caption><thead><tr>
      <th scope="col">NPL ↔ DSR (P)</th><th scope="col">Năm</th><th scope="col">r biến động năm [KTC 95%]</th><th scope="col">n</th></tr></thead><tbody>${
      rows.map(({ k, r }) => `<tr><td>${esc(I.C[k].vi)}</td><td>${esc(r.years)}</td><td>${ci(r.r_change, r.lo_change, r.hi_change)}</td><td>${r.n_change}</td></tr>`).join("")}</tbody></table>` : "";
  const newest = Math.max(...Object.values(I.D.series.npl).map((sr) => +expand(sr, "A").x.at(-1).slice(0, 4)));
  const endYear = Math.min(s.to, newest);
  const late = r.have.filter((d) => +d.last.x.slice(0, 4) < endYear).map((d) => `${d.label} (đến ${d.last.x.slice(0, 4)})`);
  $("#n-npl").innerHTML = [missingNote(r.missing, "NPL"),
    late.length ? `<span class="miss">World Bank chưa công bố các năm gần nhất:</span> ${esc(late.join(", "))} — để trống, không nối dài.` : "",
    rows.length ? "Tương quan chỉ mang tính mô tả: n nhỏ, khoảng tin cậy Fisher z. Tương quan theo mức có trong notebook." : ""].filter(Boolean).join("<br>");
}

/* ------------------------------------------------------------------ lag */
export function lagStatus(row) {
  if (!row) return { key: "nodata", text: "không có DSR" };
  if (!row.has_cycle) return { key: "nocycle", text: "không có chu kỳ tăng" };
  if (row.no_rise) return { key: "norise", text: "không tăng" };
  if (row.censored) return { key: "cens", text: "cắt cụt (cận dưới)" };
  return { key: "ok", text: "đo được" };
}

/** Dot histogram: one dot per economy; the selected ones in their colour. */
export function drawLagDots(el, ctx, b) {
  const { I, s, slots } = ctx;
  const dist = I.D.lag_dist[b];
  const pts = I.D.lags.filter((r) => r.borrower === b && r.has_cycle && !r.no_rise).sort((a, z) => a.lag_q - z.lag_q || a.iso2.localeCompare(z.iso2));
  if (!pts.length) { emptyState(el, "Không có độ trễ đo được", `Không nước nào có DSR ${b} với đỉnh truyền dẫn đo được.`); return; }
  const narrow = el.clientWidth < 520;
  const big = narrow ? 20 : 24, small = narrow ? 10 : 12;
  const stack = {};
  const X = [], Y = [], fill = [], line = [], size = [], text = [], tcol = [], cd = [];
  pts.forEach((r) => {
    stack[r.lag_q] = (stack[r.lag_q] || 0) + 1;
    const sel = s.c.includes(r.iso2);
    const col = sel ? colorOf(slots, r.iso2) : css("--muted");
    X.push(r.lag_q); Y.push(stack[r.lag_q]); text.push(sel ? r.iso2 : "");
    const solid = sel && !r.censored;
    fill.push(r.censored ? css("--bg") : sel ? col : css("--chart-axis"));
    tcol.push(solid ? "#ffffff" : css("--ink-2"));
    line.push(col); size.push(sel ? big : small);
    cd.push([I.C[r.iso2].vi, r.censored ? " (cắt cụt — cận dưới)" : "", qLabel(r.liftoff_q), qLabel(r.peak_q), r.iso2]);
  });
  const L = plotTemplate();
  L.margin = { l: 8, r: 8, t: 26, b: 8 };
  L.yaxis = { visible: false, range: [0.2, Math.max(...Y) + 1.1], fixedrange: true };
  L.xaxis = { ...L.xaxis, type: "linear", dtick: 2, title: { text: "quý từ lúc bắt đầu tăng lãi suất đến đỉnh DSR", font: { size: 12, color: css("--ink-2") } },
    range: [Math.min(-0.8, Math.min(...X) - 0.8), Math.max(...X) + 0.8] };
  const u = dist.uncensored;
  const q = (x) => vn(x, 1).replace(",0", "");
  L.shapes = Number.isFinite(u.median) ? [
    { type: "rect", x0: u.q1, x1: u.q3, yref: "paper", y0: 0, y1: 1, fillcolor: css("--surface-2"), line: { width: 0 }, layer: "below" },
    { type: "line", x0: u.median, x1: u.median, yref: "paper", y0: 0, y1: 1, line: { color: css("--ink"), width: 1.2, dash: "dash" } }] : [];
  L.annotations = Number.isFinite(u.median) ? [{ x: u.median, y: 1, yref: "paper", yanchor: "bottom", showarrow: false,
    text: `trung vị toàn cầu ${q(u.median)} quý · IQR ${q(u.q1)}–${q(u.q3)}`, font: { size: 11.5, color: css("--ink") } }] : [];
  plot(el, [{
    x: X, y: Y, text, customdata: cd, type: "scatter", mode: "markers+text",
    textfont: { size: narrow ? 7 : 9, color: tcol }, marker: { color: fill, size, line: { color: line, width: 1.6 } },
    hovertemplate: "<b>%{customdata[0]}</b><br>Bắt đầu tăng: %{customdata[2]} · đỉnh DSR: %{customdata[3]}<br>Độ trễ: %{x} quý%{customdata[1]}<br><i>Bấm để xem hồ sơ</i><extra></extra>",
  }], L, {}, (pt) => pt?.customdata?.[4]);
}

export function renderLag(ctx) {
  const { I, s, slots } = ctx;
  const b = s.b;
  const dist = I.D.lag_dist[b];
  drawLagDots($("#p-lag"), ctx, b);
  const mine = s.c.map((k) => ({ k, r: I.lag[`${k}_${b}`] }));
  const measured = mine.filter((x) => lagStatus(x.r).key === "ok").map((x) => x.r.lag_q);
  const m = median(measured);
  const g = dist.uncensored;
  $("#t-lag").textContent = measured.length
    ? `Gánh nặng đạt đỉnh sau trung vị ${vn(m, 1).replace(",0", "")} quý ở các nước đang chọn, ${vn(g.median, 1).replace(",0", "")} quý trên toàn cầu`
    : `Chưa nước đang chọn nào có độ trễ đo được (toàn cầu: ${vn(g.median, 1).replace(",0", "")} quý)`;
  $("#d-lag").textContent = `Mỗi chấm là một nền kinh tế (DSR ${b}, n = ${g.n} đo được). Vùng tô: khoảng tứ phân vị; chấm rỗng: bị cắt cụt.`;
  $("#tbl-lag").innerHTML = mine.length ? `<table class="data"><caption class="sr-only">Độ trễ của các nước đang chọn</caption><thead><tr>
    <th scope="col">Nước</th><th scope="col">Tăng LS</th><th scope="col">Đỉnh DSR</th><th scope="col">Trễ</th><th scope="col">DSR +</th><th scope="col"><span class="sr-only">Trạng thái</span></th></tr></thead><tbody>${
    mine.map(({ k, r }) => { const st = lagStatus(r); const ok = st.key === "ok" || st.key === "cens";
      return `<tr><td><span class="dot" style="background:${colorOf(slots, k)}"></span>${esc(I.C[k].vi)}</td>
        <td>${r?.liftoff ? periodLabel(r.liftoff, "M") : "—"}</td><td>${ok ? qLabel(r.peak_q) : "—"}</td>
        <td>${ok ? (st.key === "cens" ? "≥ " : "") + r.lag_q + " quý" : "—"}</td><td>${ok ? vn(r.rise_pp, 1, true) + " pp" : "—"}</td>
        <td><span class="status ${st.key}">${st.text}</span></td></tr>`; }).join("")}</tbody></table>` : "";
  $("#n-lag").innerHTML = `Độ chính xác ±1 quý. Không đổi theo khoảng năm. Kaplan–Meier (tính cả chuỗi cắt cụt): ${vn(dist.km_median, 1).replace(",0", "")} quý.`;
}

/* ------------------------------------------------------------------ scatter */
export function renderScatter(ctx) {
  const { I, s, slots } = ctx;
  const el = $("#p-scatter");
  const yLag = s.sy === "lag";
  const pts = I.D.lags.filter((r) => r.borrower === "P" && r.has_cycle && !r.no_rise && (!yLag || !r.censored));
  const key = yLag ? "hike_vs_lag" : "hike_vs_rise";
  const cx = I.D.cross[key], sm = I.D.cross.hike_vs_rise_small;
  const sel = (r) => s.c.includes(r.iso2);
  const mk = (rows, selected) => ({
    x: rows.map((r) => r.hike_pp), y: rows.map((r) => (yLag ? r.lag_q : r.rise_pp)), text: rows.map((r) => r.iso2),
    customdata: rows.map((r) => [I.C[r.iso2].vi, r.censored ? " (cắt cụt)" : "", r.iso2]),
    type: "scatter", mode: "markers+text", textposition: "top center",
    textfont: { size: selected ? 12 : 10, color: selected ? css("--ink") : css("--muted") },
    marker: { size: selected ? 13 : 9, color: rows.map((r) => (r.censored ? css("--surface") : selected ? colorOf(slots, r.iso2) : css("--chart-axis"))),
      line: { width: 1.5, color: rows.map((r) => (selected ? colorOf(slots, r.iso2) : css("--muted"))) } },
    hovertemplate: `<b>%{customdata[0]}</b><br>Lãi suất tăng: %{x:.2f} pp<br>${yLag ? "Độ trễ: %{y} quý" : "DSR tăng: %{y:+.1f} pp"}%{customdata[1]}<extra></extra>`,
  });
  const L = plotTemplate();
  L.margin = { l: 8, r: 12, t: 8, b: 8 };
  L.xaxis = { ...L.xaxis, type: "log", showgrid: true, title: { text: "mức tăng lãi suất, đáy → đỉnh (pp, thang log)" },
    tickvals: [1, 2, 3, 5, 10, 20, 40], ticktext: ["1", "2", "3", "5", "10", "20", "40"] };
  L.yaxis = { ...L.yaxis, title: { text: yLag ? "độ trễ (quý)" : "DSR tăng (pp)" }, zeroline: !yLag };
  plot(el, [mk(pts.filter((r) => !sel(r)), false), mk(pts.filter(sel), true)], L, {}, (pt) => pt?.customdata?.[2]);
  const ciTxt = (c) => `r = ${vn(c.r, 2)} [KTC 95% ${vn(c.lo, 2)}; ${vn(c.hi, 2)}], Spearman ρ = ${vn(c.spearman, 2)}, n = ${c.n}`;
  const smZero = sm.lo <= 0 && sm.hi >= 0;
  const cxZero = cx.lo <= 0 && cx.hi >= 0;
  $("#t-scatter").textContent = yLag
    ? (cxZero ? "Tăng lãi suất mạnh hay nhẹ không cho thấy quan hệ rõ với độ trễ" : `Mức tăng lãi suất có quan hệ với độ trễ (r = ${vn(cx.r, 2)})`)
    : (smZero ? "Tăng lãi suất mạnh hơn đi cùng DSR tăng nhiều hơn — nhưng chỉ nhờ vài chu kỳ cực lớn"
              : "Tăng lãi suất mạnh hơn đi cùng DSR tăng nhiều hơn, kể cả khi bỏ các chu kỳ cực lớn");
  $("#d-scatter").textContent = `PNFS (P). ${ciTxt(cx)}.`;
  $("#n-scatter").innerHTML = yLag ? "Không tính các chuỗi bị cắt cụt (độ trễ chỉ là cận dưới)."
    : `Bỏ ${sm.excluded.length} chu kỳ tăng trên ${vn(sm.threshold_pp, 0)} pp (${esc(sm.excluded.map((k) => I.C[k].vi).join(", "))}): r = ${vn(sm.r, 2)} [KTC 95% ${vn(sm.lo, 2)}; ${vn(sm.hi, 2)}], n = ${sm.n}. Luôn dùng PNFS, bất kể nhóm người vay đang chọn.`;
}

/* ------------------------------------------------------------------ map */
export function mapQuarter(ctx) {
  const all = Object.values(ctx.I.D.series.gap).map((sr) => lastValid(clip(expand(sr, "Q"), ctx.s.from, ctx.s.to))?.x).filter(Boolean);
  return all.sort().at(-1);
}

export function mapValues(ctx, q) {
  const { I, s } = ctx;
  return I.economies.map((c) => {
    const raw = I.D.series.gap[`${c.iso2}_${s.b}`];
    if (!raw) return null;
    const p = expand(raw, "Q"); const i = p.x.indexOf(q);
    return i >= 0 && p.y[i] !== null ? { c, v: p.y[i] } : null;
  }).filter(Boolean);
}

export function renderMap(ctx) {
  const { I, s } = ctx;
  const el = $("#p-map");
  const q = mapQuarter(ctx);
  const vals = mapValues(ctx, q);
  if (!vals.length) { emptyState(el, "Không có dữ liệu cho lựa chọn này", `Không nước nào có DSR ${s.b} tại ${qLabel(q)}.`); return; }
  const lim = Math.max(4, Math.ceil(Math.max(...vals.map((x) => Math.abs(x.v))) / 2) * 2);
  const steps = ["--div-neg-4", "--div-neg-3", "--div-neg-2", "--div-neg-1", "--div-mid", "--div-pos-1", "--div-pos-2", "--div-pos-3", "--div-pos-4"];
  const scale = steps.map((v, i) => [i / 8, css(v)]);
  const onMap = vals.filter((x) => x.c.iso2 !== "HK");
  const hk = vals.find((x) => x.c.iso2 === "HK");
  const selW = onMap.map((x) => (s.c.includes(x.c.iso2) ? 2.2 : 0.5));
  const selC = onMap.map((x) => (s.c.includes(x.c.iso2) ? css("--ink") : css("--surface")));
  const traces = [{
    type: "choropleth", locations: onMap.map((x) => x.c.iso3), z: onMap.map((x) => x.v), zmin: -lim, zmax: lim, colorscale: scale,
    customdata: onMap.map((x) => x.c.vi), marker: { line: { color: selC, width: selW } },
    hovertemplate: `<b>%{customdata}</b><br>${qLabel(q)}: %{z:+.1f} pp so với mức nền 20 năm<br><i>Bấm để xem hồ sơ</i><extra></extra>`,
    colorbar: { orientation: "h", thickness: 8, len: 0.5, x: 0.5, xanchor: "center", y: -0.02, yanchor: "top",
      ticksuffix: " pp", outlinewidth: 0, tickfont: { color: css("--ink-2"), size: 11 }, tickangle: 0,
      tickvals: [-lim, -lim / 2, 0, lim / 2, lim], ticktext: [-lim, -lim / 2, 0, lim / 2, lim].map((v) => `${vn(v, 0, true)} pp`) },
  }];
  if (hk) traces.push({ type: "scattergeo", lon: [114.17], lat: [22.32], mode: "markers",
    customdata: ["HK"],
    marker: { size: 12, color: [hk.v], cmin: -lim, cmax: lim, colorscale: scale, line: { color: css("--ink"), width: s.c.includes("HK") ? 2.2 : 1 } },
    hovertemplate: `<b>${esc(hk.c.vi)}</b><br>${qLabel(q)}: ${vn(hk.v, 1, true)} pp so với mức nền 20 năm<extra></extra>` });
  const L = plotTemplate();
  L.margin = { l: 0, r: 0, t: 0, b: 0 };
  L.geo = { projection: { type: "natural earth" }, showframe: false, showcoastlines: false, showland: true, landcolor: css("--map-nodata"),
    showcountries: true, countrycolor: css("--bg"), countrywidth: 0.6, bgcolor: "rgba(0,0,0,0)",
    lataxis: { range: [-50, 78] }, lonaxis: { range: [-165, 180] } };
  L.margin = { l: 0, r: 0, t: 0, b: 34 };
  const byIso3 = Object.fromEntries(I.economies.map((c) => [c.iso3, c.iso2]));
  plot(el, traces, L, { topojsonURL: "vendor/" }, (pt) => (pt?.location ? byIso3[pt.location] : pt?.customdata));
  const above = vals.filter((x) => x.v > 0).length;
  $("#t-map").textContent = `${above}/${vals.length} nền kinh tế vẫn trên mức nền 20 năm (${qLabel(q)})`;
  $("#d-map").textContent = `DSR ${BORROWER[s.b]}. Đỏ: cao hơn mức bình thường của chính nước đó · xanh: thấp hơn · xám: không có số liệu. Viền đậm: nước đang chọn.`;
  const sorted = [...vals].sort((a, z) => z.v - a.v);
  $("#tbl-map").innerHTML = `<table class="data"><caption class="sr-only">Độ lệch DSR ${qLabel(q)}</caption><thead><tr><th scope="col">Nước</th><th scope="col">Độ lệch (pp)</th><th scope="col">Trên/dưới mức nền</th></tr></thead><tbody>${
    sorted.map((x) => `<tr data-iso="${x.c.iso2}" tabindex="0" aria-label="Mở hồ sơ ${esc(x.c.vi)}"><td>${esc(x.c.vi)}${s.c.includes(x.c.iso2) ? " ◆" : ""}</td><td>${vn(x.v, 1, true)}</td><td>${x.v > 0 ? "▲ cao hơn" : "▼ thấp hơn"}</td></tr>`).join("")}</tbody></table>`;
}

/* ------------------------------------------------------------------ coverage */
/** % of expected periods in [from, min(to, dataset's latest)] with no value. */
function missingPct(raw, freq, from, to, latestIso) {
  const end = `${to}-12-31` < latestIso ? `${to}-12-31` : latestIso;
  const step = freq === "Q" ? 3 : freq === "M" ? 1 : 12;
  let expected = 0;
  for (let y = from; y <= to; y++) for (let m = step; m <= 12; m += step) {
    if (`${y}-${String(m).padStart(2, "0")}` <= end.slice(0, 7)) expected++;
  }
  if (!expected) return null;
  if (!raw) return 100;
  const p = clip(expand(raw, freq), from, to);
  const valid = p.y.filter((v, i) => v !== null && p.x[i] <= end).length;
  return Math.round(100 * (1 - valid / expected));
}

export function renderCoverage(ctx) {
  const { I, s, slots } = ctx;
  const lastDate = (ds, freq) => Object.values(I.D.series[ds]).map((sr) => expand(sr, freq).x.at(-1)).sort().at(-1);
  const ends = { dsr: lastDate("dsr", "Q"), credit: lastDate("credit", "Q"), policy: lastDate("policy", "M"), npl: lastDate("npl", "A") };
  const cell = (raw, freq, endIso, lastLabel) => {
    if (!raw) return `<td class="na">—</td>`;
    const pct = missingPct(raw, freq, s.from, s.to, endIso);
    return `<td>${esc(lastLabel)} <span class="na">· thiếu ${pct ?? "—"}%</span></td>`;
  };
  if (!s.c.length) { $("#tbl-coverage").innerHTML = ""; return; }
  $("#tbl-coverage").innerHTML = `<table class="data"><caption class="sr-only">Độ phủ dữ liệu</caption><thead><tr>
    <th scope="col">Nước</th><th scope="col">Nhóm</th><th scope="col">DSR ${s.b}: kỳ mới nhất · % thiếu</th><th scope="col">Tín dụng ${s.b}</th>
    <th scope="col">Lãi suất (mã)</th><th scope="col">NPL</th></tr></thead><tbody>${
    s.c.map((k) => { const c = I.C[k];
      const dsr = I.D.series.dsr[`${k}_${s.b}`], cr = I.D.series.credit[`${k}_${s.b}`], po = I.D.series.policy[k], np = I.D.series.npl[k];
      const lab = (raw, f) => periodLabel(expand(raw, f).x.at(-1), f);
      return `<tr><td><span class="dot" style="background:${colorOf(slots, k)}"></span>${esc(c.vi)}</td><td>${c.group === "advanced" ? "Advanced" : "Emerging"}</td>
        ${cell(dsr, "Q", ends.dsr, dsr ? lab(dsr, "Q") : "")}${cell(cr, "Q", ends.credit, cr ? lab(cr, "Q") : "")}
        ${po ? `<td>${esc(lab(po, "M"))} <span class="na">· ${esc(c.policy_code)}${c.euro ? " (ECB)" : ""} · thiếu ${missingPct(po, "M", s.from, s.to, ends.policy) ?? "—"}%</span></td>` : `<td class="na">— (không có)</td>`}
        ${cell(np, "A", ends.npl, np ? lab(np, "A") : "")}</tr>`; }).join("")}</tbody></table>`;
  $("#d-coverage").textContent = `Khoảng ${s.from}–${s.to}. Kỳ mới nhất toàn bộ dữ liệu: DSR ${qLabel(ends.dsr)}, tín dụng ${qLabel(ends.credit)}, lãi suất ${periodLabel(ends.policy, "M")}, NPL ${ends.npl.slice(0, 4)}.`;
}
