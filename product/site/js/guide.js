// "Hướng dẫn" page, rendered from guide.json. Numbers come from data.json via tokens.
import { $, esc } from "./util.js";
import { guideCardHTML } from "./ui.js";

/** Values for {token} placeholders in guide.json. */
export function guideTokens(I) {
  const S = I.D.meta.summary;
  const npln = I.D.npl_corr.map((r) => r.n_level);
  return {
    n_dsr: S.with_dsr, n_hn: S.with_dsr_breakdown_HN, npl_n_min: Math.min(...npln), npl_n_max: Math.max(...npln),
    cross_n: I.D.cross.hike_vs_rise.n, large_hike: I.D.meta.large_hike_pp,
    dsr_last: q(S.latest.dsr), credit_last: q(S.latest.credit), policy_last: m(S.latest.policy), npl_last: S.latest.npl,
    retrieved: I.D.meta.retrieved,
  };
}
// fetch_summary.json labels: "2026-Q1" -> "Q1/2026", "2026-08" -> "08/2026"
const q = (s) => s.replace(/(\d{4})-Q(\d)/, "Q$2/$1");
const m = (s) => s.replace(/(\d{4})-(\d{2})/, "$2/$1");

export const fill = (str, tok) => String(str).replace(/\{(\w+)\}/g, (m, k) => (k in tok ? tok[k] : m));

/** Deep-replace {token} in every string of a JSON tree. */
export function fillAll(obj, tok) {
  if (typeof obj === "string") return fill(obj, tok);
  if (Array.isArray(obj)) return obj.map((x) => fillAll(x, tok));
  if (obj && typeof obj === "object") return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fillAll(v, tok)]));
  return obj;
}

export function renderGuide(G, I, onPreset) {
  const card = (key) => { const g = G.charts[key]; return `<section class="gcard" id="g-${key}"><h3>${esc(g.title)}</h3><div class="guide-card">${guideCardHTML(G, g)}</div></section>`; };
  $("#guide").innerHTML = `
    <div class="kicker">Hướng dẫn</div>
    <h1>Cách dùng và cách đọc dashboard</h1>
    <p class="lede">Ba cách bắt đầu nhanh, cách đọc từng biểu đồ, giải thích thuật ngữ và nguồn dữ liệu.</p>
    <button class="btn" type="button" id="guide-tour">▶ Xem lại tour giới thiệu</button>

    <h2 id="quick">Bắt đầu nhanh</h2>
    <div class="guide-grid">${G.quickstart.map((p) => `<button type="button" class="preset" data-preset="${p.id}">
      <b>${esc(p.title)}</b><span>${esc(p.desc)}</span><em>Áp dụng bộ lọc →</em></button>`).join("")}</div>

    <h2 id="charts">Cách đọc từng biểu đồ</h2>
    <div class="guide-grid">${Object.keys(G.charts).map(card).join("")}</div>

    <h2 id="glossary">Thuật ngữ</h2>
    <dl class="glossary">${G.glossary.map((g) => `<dt id="term-${g.id}">${esc(g.term)}</dt><dd>${esc(g.long)}<i>Ví dụ đời thường: ${esc(g.example)}</i></dd>`).join("")}</dl>

    <h2 id="faq">Câu hỏi thường gặp</h2>
    <div class="faq">${G.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div>

    <h2 id="data">Dữ liệu lấy từ đâu, cập nhật khi nào</h2>
    <p>${esc(G.data.intro)}</p>
    <div class="tbl-wrap"><table class="data"><caption class="sr-only">Nguồn dữ liệu</caption><thead><tr><th scope="col">Bộ dữ liệu</th><th scope="col">Mã</th><th scope="col">Tần suất</th><th scope="col">Đơn vị</th><th scope="col">Kỳ mới nhất</th></tr></thead>
      <tbody>${G.data.sources.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.code)}</td><td>${esc(s.freq)}</td><td>${esc(s.unit)}</td><td>${esc(s.last)}</td></tr>`).join("")}</tbody></table></div>
    <p>${esc(G.data.updated)}</p>
    <p><code>${esc(G.data.howto.replace(/`/g, ""))}</code></p>`;
  $("#guide").addEventListener("click", (e) => {
    const p = e.target.closest("[data-preset]");
    if (p) onPreset(G.quickstart.find((q) => q.id === p.dataset.preset));
  });
}
