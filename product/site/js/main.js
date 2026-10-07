// Entry point: load data, keep state in the URL, render lazily, route between views.
import { $, $$, vn, qLabel, median } from "./util.js";
import { buildIndex, parseURL, toURL, assignSlots, resolvePreset, HASH, FOCUS } from "./state.js";
import * as charts from "./charts.js";
import { initFilters, syncFilters, initTheme, initHowto, initTerms, toast } from "./ui.js";
import { renderGuide, guideTokens, fillAll } from "./guide.js";
import { renderStory, renderStoryFigures } from "./story.js";
import { startTour, tourSeen } from "./tour.js";
import { openCountry, closeCountry } from "./country.js";

let I, G, s, slots, ui;
const dirty = new Set();
const visible = new Set();
let storyDone = false;        // story text rendered
let figuresDone = false;      // story figures rendered (need Plotly + series)

const RENDER = {
  dsr: charts.renderDSR, lag: charts.renderLag, map: charts.renderMap, credit: charts.renderCredit,
  policy: charts.renderPolicy, npl: charts.renderNPL, scatter: charts.renderScatter, coverage: charts.renderCoverage,
};
const ctx = () => ({ I, s, slots, G });
const NEEDS_SELECTION = ["dsr", "credit", "policy", "npl", "coverage"];

/* ------------------------------------------------------------------ boot */
async function load() {
  $("#load-error").hidden = true;
  try {
    const [d, g] = await Promise.all([
      fetch("data.json").then((r) => { if (!r.ok) throw new Error(`data.json: HTTP ${r.status}`); return r.json(); }),
      fetch("guide.json").then((r) => { if (!r.ok) throw new Error(`guide.json: HTTP ${r.status}`); return r.json(); }),
    ]);
    return [d, g];
  } catch (e) {
    $("#load-error-msg").textContent = e.message || String(e);
    $("#load-error").hidden = false;
    $$(".view").forEach((v) => (v.hidden = true));
    throw e;
  }
}

/** The long series (levels, credit, policy, NPL) arrive after the first screen. */
let seriesReady = false;
function loadSeries() {
  return fetch("data-series.json").then((r) => { if (!r.ok) throw new Error(`data-series.json: HTTP ${r.status}`); return r.json(); })
    .then((x) => { Object.assign(I.D.series, x.series); seriesReady = true; });
}

/** Plotly is injected only after the headline and KPIs are on screen: it is the
 *  heaviest file on the page and no chart is needed for the first paint. */
let plotlyPromise = null;
function loadPlotly() {
  plotlyPromise ??= new Promise((res, rej) => {
    const sc = document.createElement("script");
    sc.src = "vendor/plotly-geo.min.js";
    sc.onload = () => res();
    sc.onerror = () => rej(new Error("Không tải được thư viện biểu đồ (vendor/plotly-geo.min.js)."));
    document.head.appendChild(sc);
  });
  return plotlyPromise;
}

async function main() {
  const [D, rawGuide] = await load();
  I = buildIndex(D);
  G = fillAll(rawGuide, guideTokens(I));
  s = normalize(parseURL(I));
  slots = assignSlots(s.c);
  history.replaceState(null, "", toURL(s, I));

  fillStatic();
  ui = initFilters(I, () => s, setState);
  initTheme(rerenderAll);
  initHowto(G);
  initTerms(G);
  renderGuide(G, I, applyPreset);
  $("#guide-tour")?.addEventListener("click", runTour);
  $("#help-fab").addEventListener("click", runTour);
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-action]");
    if (!a) return;
    if (a.dataset.action === "borrower-P") setState({ b: "P" });
    if (a.dataset.action === "focus") setState({ c: [...FOCUS] });
  });
  window.addEventListener("hashchange", () => { setState({ view: parseURL(I).view }, false); });
  window.addEventListener("popstate", () => { s = normalize(parseURL(I)); slots = assignSlots(s.c); afterChange(); });

  charts.onCountryClick(showCountry);
  document.addEventListener("click", (e) => { const tr = e.target.closest("#tbl-map tr[data-iso]"); if (tr) showCountry(tr.dataset.iso); });
  document.addEventListener("keydown", (e) => {
    const tr = e.target.closest?.("#tbl-map tr[data-iso]");
    if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); showCountry(tr.dataset.iso); }
  });
  initMotion();
  observeCards();
  afterChange();
  markFirstScreen();
  // Start the heavy downloads only after the first frame with text has been painted.
  // The chart library is the heaviest file on the page: fetch it (and the long
  // series) only when a chart is about to scroll into view. The guide never needs it.
  if (!tourSeen() && s.view === "dashboard") setTimeout(runTour, 900);
}

function fillStatic() {
  const T = guideTokens(I);
  const vals = {
    n_dsr: T.n_dsr, dsr_last: T.dsr_last,
    cycle_window: `${I.D.meta.cycle_window[0].slice(0, 4)}–${I.D.meta.cycle_window[1].slice(0, 4)}`,
    built_line: `Dữ liệu tải ngày ${I.D.meta.retrieved}`,
  };
  $$("[data-k]").forEach((el) => { if (el.dataset.k in vals) el.textContent = vals[el.dataset.k]; });
}

/* ------------------------------------------------------------------ state */
/** If the chosen borrower is not published for any selected economy, fall back to P. */
function normalize(st) {
  return st.b !== "P" && !st.c.some((k) => I.C[k].has[st.b]) ? { ...st, b: "P" } : st;
}

function setState(patch, writeURL = true) {
  s = normalize({ ...s, ...patch });
  if (patch.c) slots = assignSlots(s.c);
  if (writeURL) history.replaceState(null, "", toURL(s, I));
  afterChange();
}

function applyPreset(p) {
  s = normalize({ ...resolvePreset(p.state, I), view: "dashboard" });
  slots = assignSlots(s.c);
  history.pushState(null, "", toURL(s, I));
  afterChange();
  window.scrollTo({ top: 0 });
  toast(`Đã áp dụng: ${p.title}`);
}

function afterChange() {
  syncFilters(I, s, slots);
  showView(s.view);
  if (s.view === "dashboard") {
    renderTop();
    Object.keys(RENDER).forEach((k) => dirty.add(k));
    flush();
  }
}

/* ------------------------------------------------------------------ views */
let lastView = null;
function showView(v) {
  if (v !== "dashboard") closeCountry();
  // Fade only real view switches; animating the first view would delay its first paint.
  if (lastView && lastView !== v) document.documentElement.classList.add("animate-views");
  lastView = v;
  $$("main .view").forEach((el) => { el.hidden = el.dataset.view !== v; });
  const title = { dashboard: "Bảng điều khiển", story: "Câu chuyện dữ liệu", guide: "Hướng dẫn" }[v];
  document.title = `${title} · Độ trễ lãi suất → gánh nặng trả nợ`;
  if (v === "story") {
    if (!storyDone) { renderStory(I); storyDone = true; $$("#story .plot").forEach((el) => chartIO.observe(el)); }
    if (!figuresDone && window.Plotly && seriesReady) { renderStoryFigures(I); figuresDone = true; }
  }
  if (v === "guide") {
    const target = location.hash.match(/g-\w+/)?.[0];
    if (target) $(`#${target}`)?.scrollIntoView();
  }
}

/* ------------------------------------------------------------------ lazy charts */
let chartsRequested = false;
/** Resolves once the first screen (headline, KPIs, story text) has been rendered from
 *  data and painted, so the chart library never competes with the first paint. */
let markFirstScreen;
const pageSettled = new Promise((res) => { markFirstScreen = res; }).then(() => new Promise((res) =>
  requestAnimationFrame(() => requestAnimationFrame(() =>
    (window.requestIdleCallback ? requestIdleCallback(() => setTimeout(res, 300), { timeout: 700 }) : setTimeout(res, 500))))));

function requestCharts() {
  if (chartsRequested) return;
  chartsRequested = true;
  pageSettled.then(() => Promise.all([loadPlotly(), loadSeries()])).then(() => {
    Object.keys(RENDER).forEach((k) => dirty.add(k));
    flush();
    if (s.view === "story") showView("story");
  }).catch((e) => {
    $$("[data-chart] .plot, .article .plot").forEach((el) => charts.emptyState(el, "Không tải được thư viện biểu đồ", e.message));
  });
}

const chartIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    const k = e.target.dataset.chart;
    if (k) { if (e.isIntersecting) visible.add(k); else visible.delete(k); }
    if (e.isIntersecting) requestCharts();
  });
  flush();
}, { rootMargin: "0px" });

function observeCards() {
  $$("[data-chart]").forEach((el) => chartIO.observe(el));
}

function flush() {
  if (s.view !== "dashboard" || !window.Plotly || !seriesReady) return;
  [...dirty].filter((k) => visible.has(k)).forEach((k) => {
    dirty.delete(k);
    if (!s.c.length && NEEDS_SELECTION.includes(k)) {
      const el = $(`#p-${k}`) || $(`#tbl-${k}`);
      charts.emptyState(el, "Chưa chọn nền kinh tế nào", "Chọn ít nhất một nước để xem biểu đồ này.", { id: "focus", label: "Chọn 4 nước gốc" });
      return;
    }
    try { RENDER[k](ctx()); }
    catch (e) {
      console.error(k, e);
      charts.emptyState($(`#p-${k}`) || $(`#tbl-${k}`), "Biểu đồ này gặp lỗi khi vẽ", "Hãy tải lại trang. Các biểu đồ khác vẫn dùng được.");
    }
  });
}

function rerenderAll() {
  Object.keys(RENDER).forEach((k) => dirty.add(k));
  flush();
  if (figuresDone) { figuresDone = false; if (s.view === "story") showView("story"); }
}

/* ------------------------------------------------------------------ headline + KPIs */
function renderTop() {
  const c = ctx();
  const dist = I.D.lag_dist[s.b];
  const head = charts.gapHeadline(c);
  $("#headline").textContent = s.c.length ? (head ?? `Các nước đang chọn không có DSR ${s.b} trong khoảng ${s.from}–${s.to}`) : "Chưa chọn nền kinh tế nào";
  const P = I.D.lag_dist.P.uncensored;
  $("#lede").innerHTML = `Trên ${I.D.meta.summary.with_dsr} nền kinh tế BIS công bố DSR, gánh nặng trả nợ đạt đỉnh <b>trung vị ${vn(P.median, 1).replace(",0", "")} quý</b> sau khi ngân hàng trung ương bắt đầu tăng lãi suất (khoảng tứ phân vị ${vn(P.q1, 1).replace(",0", "")}–${vn(P.q3, 1).replace(",0", "")} quý, n = ${P.n}).`;

  const q = charts.mapQuarter(c);
  const atQ = charts.mapValues(c, q).filter((x) => s.c.includes(x.c.iso2));
  $("#kpi-n").innerHTML = `<span class="num"></span>`; countTo($("#kpi-n .num"), s.c.length, 0);
  $("#kpi-n-s").textContent = s.c.length ? `${s.c.filter((k) => I.C[k].has.P).length} có DSR · ${s.c.filter((k) => I.C[k].has.H).length} có tách hộ gia đình / doanh nghiệp` : "Bấm “Chọn nước” để bắt đầu";
  const mg = median(atQ.map((x) => x.v));
  $("#kpi-gap").innerHTML = Number.isFinite(mg)
    ? `<span class="delta ${mg >= 0 ? "up" : "down"}" aria-hidden="true">${mg >= 0 ? "▲" : "▼"}</span><span class="num"></span><small>pp</small>`
      + `<span class="sr-only">${mg >= 0 ? "cao hơn" : "thấp hơn"} mức nền</span>` : "—";
  if (Number.isFinite(mg)) countTo($("#kpi-gap .num"), mg, 1, true);
  $("#kpi-gap-s").textContent = Number.isFinite(mg) ? `DSR ${s.b} so với mức nền 20 năm, ${qLabel(q)} · ${atQ.length} nước` : `không có DSR ${s.b} tại ${qLabel(q)}`;
  const rows = s.c.map((k) => I.lag[`${k}_${s.b}`]);
  const ok = rows.filter((r) => charts.lagStatus(r).key === "ok").map((r) => r.lag_q);
  const ml = median(ok);
  $("#kpi-lag").innerHTML = Number.isFinite(ml) ? `<span class="num"></span><small>quý</small>` : "—";
  if (Number.isFinite(ml)) countTo($("#kpi-lag .num"), ml, Number.isInteger(ml) ? 0 : 1);
  $("#kpi-lag-s").textContent = `±1 quý · ${ok.length} nước đo được · toàn cầu ${vn(dist.uncensored.median, 1).replace(",0", "")} quý`;
  const cens = rows.filter((r) => charts.lagStatus(r).key === "cens");
  $("#kpi-cens").innerHTML = `<span class="num"></span>`; countTo($("#kpi-cens .num"), cens.length, 0);
  $("#kpi-cens-s").textContent = cens.length ? `${cens.map((r) => I.C[r.iso2].vi).join(", ")} — đỉnh có thể còn ở phía sau` : "không có chuỗi nào đang chọn bị cắt cụt";

}

/* ------------------------------------------------------------------ country profile */
function showCountry(k) {
  openCountry(k, ctx(), {
    toggle: (x) => setState({ c: s.c.includes(x) ? s.c.filter((y) => y !== x) : [...s.c, x] }),
    only: (x) => setState({ c: [x] }),
  });
}

/* ------------------------------------------------------------------ motion */
const MOTION = !matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Entrance reveal for KPI tiles, sections and cards; sticky toolbar shadow. */
function initMotion() {
  const bar = $("#filters");
  const onScroll = () => bar.classList.toggle("stuck", window.scrollY > 70);
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  if (!MOTION) return;
  document.documentElement.classList.add("motion");
  const items = [...$$(".kpi"), ...$$(".dsec"), ...$$(".dsec .card")];
  $$(".kpi").forEach((el, i) => el.style.setProperty("--d", `${i * 70}ms`));
  $$(".dsec .grid").forEach((g) => [...g.children].forEach((el, i) => el.style.setProperty("--d", `${i * 90}ms`)));
  items.forEach((el) => el.classList.add("reveal"));
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -8% 0px" });
  items.forEach((el) => io.observe(el));
}

/** Count a KPI number up (or down) to its new value. */
function countTo(el, to, d, sign = false) {
  const from = Number(el.dataset.v ?? (MOTION ? 0 : to));
  el.dataset.v = to;
  const fmt = (x) => vn(x, d, sign);
  if (!MOTION || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 900;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(to);
  };
  requestAnimationFrame(step);
}

/* ------------------------------------------------------------------ tour */
function runTour() {
  if (s.view !== "dashboard") { location.hash = HASH.dashboard; }
  ui.closePicker(false); ui.closeDrawer();
  setTimeout(() => startTour(G.tour), 50);
}

main().catch(() => { /* error banner already shown */ });
$("#retry-btn").addEventListener("click", () => location.reload());
