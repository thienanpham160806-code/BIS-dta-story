// Country profile drawer: opened from the map, the map's table, or a chart mark.
// Every number is read from data.json / data-series.json, like the rest of the site.
import { $, css, esc, vn, expand, lastValid, periodLabel, qLabel } from "./util.js";
import { colorOf } from "./state.js";
import { plotTemplate, lagStatus } from "./charts.js";

const REGION_VI = {
  "East Asia & Pacific": "Đông Á & Thái Bình Dương", "South Asia": "Nam Á", "Europe & Central Asia": "Châu Âu & Trung Á",
  "North America": "Bắc Mỹ", "Latin America & Caribbean": "Mỹ Latinh & Caribe",
  "Middle East, North Africa, Afghanistan & Pakistan": "Trung Đông & Bắc Phi", "Sub-Saharan Africa": "Châu Phi cận Sahara",
};
let opener = null;
let current = null;

function ensureDom() {
  if ($("#cprof")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="cprof-scrim" id="cprof-scrim" hidden></div>
    <aside class="cprof" id="cprof" role="dialog" aria-modal="true" aria-labelledby="cprof-title" tabindex="-1">
      <div class="cprof-head">
        <div class="kicker" id="cprof-kicker"></div>
        <h2 id="cprof-title"></h2>
        <p class="sub" id="cprof-sub"></p>
        <button class="iconbtn" type="button" id="cprof-close" aria-label="Đóng hồ sơ nước"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      <div class="cprof-body" id="cprof-body"></div>
      <div class="cprof-actions">
        <button class="btn primary" type="button" id="cprof-toggle"></button>
        <button class="btn" type="button" id="cprof-only">Chỉ xem nước này</button>
      </div>
    </aside>`);
  $("#cprof-close").addEventListener("click", closeCountry);
  $("#cprof-scrim").addEventListener("click", closeCountry);
  $("#cprof").addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); closeCountry(); }
    if (e.key === "Tab") {                                   // keep focus inside the drawer
      const f = [...$("#cprof").querySelectorAll("button, [href], [tabindex='0']")].filter((x) => x.offsetParent);
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
}

export function closeCountry() {
  const d = $("#cprof");
  if (!d || !d.classList.contains("open")) return;
  d.classList.remove("open"); $("#cprof-scrim").classList.remove("open");
  setTimeout(() => { $("#cprof-scrim").hidden = true; }, 280);
  if (window.Plotly && $("#cprof-spark")?._fullLayout) window.Plotly.purge($("#cprof-spark"));
  current = null;
  opener?.focus?.();
}

const dlRow = (k, v) => `<dt>${esc(k)}</dt>${v === null || v === undefined || v === "" ? `<dd class="na">không có số liệu</dd>` : `<dd>${v}</dd>`}`;
const last = (sr, f) => (sr ? lastValid(expand(sr, f)) : null);
const delta = (g) => `<span class="delta ${g >= 0 ? "up" : "down"}" aria-hidden="true">${g >= 0 ? "▲" : "▼"}</span>`;

/**
 * @param {string} k        ISO2 code
 * @param {object} ctx      {I, s, slots, G}
 * @param {object} actions  {toggle(k), only(k)}
 */
export function openCountry(k, ctx, actions) {
  const { I, s, slots, G } = ctx;
  const c = I.C[k];
  if (!c) return;
  ensureDom();
  opener = document.activeElement;
  current = k;
  const D = I.D;
  const color = s.c.includes(k) && slots[k] ? colorOf(slots, k) : css("--accent");
  $("#cprof").style.setProperty("--cprof-color", color);

  $("#cprof-kicker").textContent = `${c.group === "advanced" ? "Advanced" : "Emerging"} · ${REGION_VI[c.region] || c.region}`;
  $("#cprof-title").textContent = c.vi;
  $("#cprof-sub").textContent = [c.en !== c.vi ? c.en : "", c.euro ? `thành viên khu vực euro từ ${c.euro_since}` : "",
    c.has.H ? "có DSR tách hộ gia đình / doanh nghiệp" : (c.has.P ? "DSR tổng khu vực tư nhân" : "")].filter(Boolean).join(" · ");

  const recP = I.rec[`${k}_P`];
  const lagP = I.lag[`${k}_P`];
  const st = lagStatus(lagP);
  const cyc = D.cycles[k];
  const pol = last(D.series.policy?.[k], "M");
  const npl = last(D.series.npl?.[k], "A");
  const cr = (b) => last(D.series.credit?.[`${k}_${b}`], "Q");
  const nc = I.npl[k];

  // ---- hero stats
  const hero = recP ? `
    <div class="cprof-hero">
      <div class="cprof-stat"><div class="k">Độ lệch DSR (P)</div>
        <div class="v">${delta(recP.gap_now)}${vn(recP.gap_now, 1, true)}<small>pp</small></div>
        <div class="s">so với mức nền 20 năm · ${esc(recP.latest_q.replace(/(\d{4})-Q(\d)/, "Q$2/$1"))}</div></div>
      <div class="cprof-stat"><div class="k">Mức DSR (P)</div>
        <div class="v">${vn(recP.latest, 1)}<small>%</small></div>
        <div class="s">mức nền 20 năm: ${vn(recP.bench, 1)}%</div></div>
      <div class="cprof-stat"><div class="k">Độ trễ đến đỉnh</div>
        <div class="v">${st.key === "ok" || st.key === "cens" ? `${st.key === "cens" ? "≥" : ""}${lagP.lag_q}<small>quý</small>` : "—"}</div>
        <div class="s">${esc(st.text)}${st.key === "ok" ? " · ±1 quý" : ""}</div></div>
      <div class="cprof-stat"><div class="k">Đã gỡ phần vượt đỉnh</div>
        <div class="v">${Number.isFinite(recP.unwound_pct) ? (recP.unwound_pct >= 100 ? "100<small>%+</small>" : `${vn(recP.unwound_pct, 0)}<small>%</small>`) : "—"}</div>
        <div class="s">${Number.isFinite(recP.gap_peak) ? `đỉnh: ${vn(recP.gap_peak, 1, true)} pp` : "chưa từng vượt mức nền đáng kể"}</div></div>
    </div>` : `<div class="note-box">BIS không công bố DSR cho ${esc(c.vi)}. Dưới đây là các số liệu khác có sẵn.</div>`;

  // ---- spark: DSR gap (or the policy rate when there is no DSR)
  const spark = `<div><h3>${recP ? "Độ lệch DSR so với mức nền, từ 2006" : "Lãi suất chính sách, từ 2006"}</h3><div class="cprof-spark" id="cprof-spark"></div></div>`;

  // ---- cycle
  const cycle = `<div><h3>Chu kỳ lãi suất ${D.meta.cycle_window[0].slice(0, 4)}–${D.meta.cycle_window[1].slice(0, 4)}</h3><dl>
    ${dlRow("Bắt đầu tăng", cyc?.has_cycle ? periodLabel(cyc.liftoff, "M") : (cyc ? "không có chu kỳ tăng" : null))}
    ${dlRow("Lãi suất tăng (đáy → đỉnh)", cyc?.has_cycle ? `+${vn(cyc.hike_pp, 2)} điểm %` : null)}
    ${dlRow("Đỉnh DSR sau đó", lagP && (st.key === "ok" || st.key === "cens") ? `${qLabel(lagP.peak_q)} (${vn(lagP.rise_pp, 1, true)} pp)` : null)}
    ${dlRow("Lãi suất hiện tại", pol ? `${vn(pol.y, 2)}% (${periodLabel(pol.x, "M")})` : null)}
    ${dlRow("Mã lãi suất dùng", c.policy_code ? `${esc(c.policy_code)}${c.euro ? " · ECB" : ""}` : null)}
  </dl></div>`;

  // ---- context
  const hn = ["H", "N"].map((b) => I.rec[`${k}_${b}`]).filter(Boolean);
  const context = `<div><h3>Bối cảnh</h3><dl>
    ${dlRow("Tín dụng / GDP (P)", cr("P") ? `${vn(cr("P").y, 0)}% (${qLabel(cr("P").x)})` : null)}
    ${cr("H") ? dlRow("· hộ gia đình (H)", `${vn(cr("H").y, 0)}%`) : ""}
    ${cr("N") ? dlRow("· doanh nghiệp (N)", `${vn(cr("N").y, 0)}%`) : ""}
    ${hn.map((r) => dlRow(`Độ lệch DSR ${r.borrower === "H" ? "hộ gia đình" : "doanh nghiệp"}`, `${vn(r.gap_now, 1, true)} pp`)).join("")}
    ${dlRow("Nợ xấu (NPL)", npl ? `${vn(npl.y, 2)}% (${npl.x.slice(0, 4)})` : null)}
    ${nc && Number.isFinite(nc.r_change) ? dlRow("Tương quan NPL ↔ DSR (biến động)", `${vn(nc.r_change, 2)} [${Number.isFinite(nc.lo_change) ? vn(nc.lo_change, 2) : "—"}; ${Number.isFinite(nc.hi_change) ? vn(nc.hi_change, 2) : "—"}], n = ${nc.n_change}`) : ""}
    ${dlRow("Kỳ mới nhất: DSR · tín dụng · NPL", [c.last.dsr || "—", c.last.credit || "—", c.last.npl || "—"].join(" · "))}
  </dl></div>`;

  const noteTxt = c.euro ? `Từ ${c.euro_since}, lãi suất chính sách là lãi suất của ECB (nguồn danh sách thành viên: ECB).`
    : (G?.regime_notes?.[k] || c.policy_note || "");
  const note = noteTxt ? `<div class="note-box">${esc(noteTxt)}</div>` : "";

  $("#cprof-body").innerHTML = hero + spark + cycle + context + note;
  const selected = s.c.includes(k);
  $("#cprof-toggle").textContent = selected ? "Bỏ khỏi so sánh" : "+ Thêm vào so sánh";
  $("#cprof-toggle").onclick = () => { actions.toggle(k); closeCountry(); };
  $("#cprof-only").onclick = () => { actions.only(k); closeCountry(); };

  $("#cprof-scrim").hidden = false;
  requestAnimationFrame(() => { $("#cprof-scrim").classList.add("open"); $("#cprof").classList.add("open"); });
  setTimeout(() => $("#cprof-close").focus(), 50);
  drawSpark(k, ctx, color, !!recP);
}

function drawSpark(k, ctx, color, hasDsr) {
  const { I } = ctx;
  const el = $("#cprof-spark");
  if (!window.Plotly || !el) return;
  const raw = hasDsr ? I.D.series.gap[`${k}_P`] : I.D.series.policy?.[k];
  if (!raw) { el.innerHTML = `<div class="empty"><span>Không có số liệu</span></div>`; return; }
  const p = expand(raw, hasDsr ? "Q" : "M");
  const keep = p.x.map((x, i) => [x, p.y[i]]).filter(([x]) => x >= "2006-01-01");
  const x = keep.map((d) => d[0]), y = keep.map((d) => d[1]);
  const L = plotTemplate();
  L.margin = { l: 4, r: 8, t: 6, b: 4 };
  L.xaxis = { ...L.xaxis, type: "date", tickformat: "%Y", nticks: 6 };
  L.yaxis = { ...L.yaxis, ticksuffix: hasDsr ? " pp" : "%", zeroline: hasDsr, nticks: 5 };
  const traces = [{
    x, y, type: "scatter", mode: "lines", line: { color, width: 2.2 }, fill: hasDsr ? "tozeroy" : "none",
    fillcolor: `${color}22`, connectgaps: false,
    customdata: x.map((d) => periodLabel(d, hasDsr ? "Q" : "M")),
    hovertemplate: `%{customdata}: %{y:${hasDsr ? "+.1f" : ".2f"}}${hasDsr ? " pp" : "%"}<extra></extra>`,
  }];
  const lq = I.lag[`${k}_P`]?.liftoff_q;
  const i = hasDsr && lq ? x.indexOf(lq) : -1;
  if (i >= 0) traces.push({ x: [lq], y: [y[i]], type: "scatter", mode: "markers", hoverinfo: "skip",
    marker: { size: 10, color: css("--surface"), line: { color, width: 2.2 } } });
  window.Plotly.newPlot(el, traces, L, { displayModeBar: false, responsive: true });
}

export const currentCountry = () => current;
