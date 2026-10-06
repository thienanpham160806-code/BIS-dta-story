// Filter controls, picker, drawer, theme, toast, "how to read" dialog, glossary tips.
import { $, $$, esc, store, debounce } from "./util.js";
import { colorOf, FOCUS } from "./state.js";

const REGION_VI = {
  "East Asia & Pacific": "Đông Á & Thái Bình Dương", "South Asia": "Nam Á", "Europe & Central Asia": "Châu Âu & Trung Á",
  "North America": "Bắc Mỹ", "Latin America & Caribbean": "Mỹ Latinh & Caribe",
  "Middle East, North Africa, Afghanistan & Pakistan": "Trung Đông & Bắc Phi", "Sub-Saharan Africa": "Châu Phi cận Sahara",
};
const norm = (x) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/* ------------------------------------------------------------------ toast */
let toastTimer;
export function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; delete t.dataset.hidden;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.dataset.hidden = ""; }, 2600);
}

/* ------------------------------------------------------------------ theme */
export function initTheme(onChange) {
  $("#theme-btn").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("theme", next);
    $('meta[name="theme-color"]').setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
    onChange();
  });
}

/* ------------------------------------------------------------------ filters */
export function initFilters(I, getState, setState) {
  // chips + picker
  const btn = $("#country-picker-btn"), picker = $("#picker"), search = $("#picker-search");
  const open = () => {
    picker.hidden = false; btn.setAttribute("aria-expanded", "true");
    const r = btn.getBoundingClientRect(), host = $("#filters").getBoundingClientRect();
    picker.style.left = `${Math.max(8, Math.min(r.left - host.left, host.width - picker.offsetWidth - 8))}px`;
    picker.style.top = `${r.bottom - host.top + 6}px`;
    renderPickerList(I, getState, setState); search.value = ""; search.focus();
  };
  const close = (focusBack = true) => { if (picker.hidden) return; picker.hidden = true; btn.setAttribute("aria-expanded", "false"); if (focusBack) btn.focus(); };
  btn.addEventListener("click", () => (picker.hidden ? open() : close()));
  $("#picker-done").addEventListener("click", () => close());
  picker.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
  document.addEventListener("pointerdown", (e) => { if (!picker.hidden && !picker.contains(e.target) && !btn.contains(e.target)) close(false); });
  search.addEventListener("input", debounce(() => renderPickerList(I, getState, setState, search.value), 60));
  $$(".quick button").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.quick;
    setState({ c: k === "clear" ? [] : [...I.groups[k]] });
    renderPickerList(I, getState, setState, search.value);
  }));
  $("#chips").addEventListener("click", (e) => {
    const x = e.target.closest("[data-remove]");
    if (x) { setState({ c: getState().c.filter((k) => k !== x.dataset.remove) }); btn.focus(); }
  });

  // borrower
  $("#borrower-seg").addEventListener("click", (e) => { const b = e.target.closest("[data-b]"); if (b && !b.disabled) setState({ b: b.dataset.b }); });
  // mode
  $("#mode-toggle").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) setState({ v: b.dataset.v }); });
  // scatter y
  $("#scatter-y").addEventListener("click", (e) => { const b = e.target.closest("[data-y]"); if (b) setState({ sy: b.dataset.y }); });

  // year slider
  const f = $("#yr-from"), t = $("#yr-to");
  [f, t].forEach((el) => { el.min = I.minYear; el.max = I.maxYear; });
  const onYear = (which) => () => {
    let a = +f.value, z = +t.value;
    if (a > z) { if (which === "from") a = z; else z = a; f.value = a; t.value = z; }
    paintYears(a, z, I);
    commitYears(a, z);
  };
  const commitYears = debounce((a, z) => setState({ from: a, to: z }), 150);
  f.addEventListener("input", onYear("from")); t.addEventListener("input", onYear("to"));

  // share
  $("#share-btn").addEventListener("click", async () => {
    const url = location.href;
    try { await navigator.clipboard.writeText(url); toast("Đã sao chép link — người nhận sẽ thấy đúng bộ lọc này."); }
    catch { window.prompt("Sao chép link này:", url); }
  });

  // drawer (mobile)
  const panel = $("#filter-panel"), scrim = $("#drawer-scrim"), dbtn = $("#drawer-btn");
  const openDrawer = () => { panel.classList.add("open"); scrim.hidden = false; dbtn.setAttribute("aria-expanded", "true"); $("#drawer-close").focus(); };
  const closeDrawer = () => { if (!panel.classList.contains("open")) return; panel.classList.remove("open"); scrim.hidden = true; dbtn.setAttribute("aria-expanded", "false"); dbtn.focus(); };
  dbtn.addEventListener("click", openDrawer);
  $("#drawer-close").addEventListener("click", closeDrawer);
  scrim.addEventListener("click", closeDrawer);
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape" && panel.classList.contains("open")) closeDrawer(); });
  return { openDrawer, closeDrawer, closePicker: close };
}

function paintYears(a, z, I) {
  $("#yr-from-out").textContent = a; $("#yr-to-out").textContent = z;
  const span = I.maxYear - I.minYear || 1;
  const fill = $("#yr-fill");
  fill.style.left = `${((a - I.minYear) / span) * 100}%`;
  fill.style.right = `${100 - ((z - I.minYear) / span) * 100}%`;
  $("#yr-from").setAttribute("aria-valuetext", `từ năm ${a}`);
  $("#yr-to").setAttribute("aria-valuetext", `đến năm ${z}`);
}

/** Reflect state into every control (called after each state change). */
export function syncFilters(I, s, slots) {
  // chips
  const chips = $("#chips"), pbtn = $("#country-picker-btn");
  $$(".chip", chips).forEach((c) => c.remove());
  const MAXCHIPS = 10;
  const html = s.c.slice(0, MAXCHIPS).map((k) => `<span class="chip"><span class="dot" style="background:${colorOf(slots, k)}" aria-hidden="true"></span>${esc(I.C[k].vi)}
      <button class="x" type="button" data-remove="${k}" aria-label="Bỏ ${esc(I.C[k].vi)}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>`).join("")
    + (s.c.length > MAXCHIPS ? `<span class="chip more">+${s.c.length - MAXCHIPS} nước</span>` : "");
  pbtn.insertAdjacentHTML("beforebegin", html);
  pbtn.lastChild.textContent = s.c.length ? "Thêm / bớt nước" : "Chọn nước";

  // borrower: hide H/N when no selected economy publishes them
  const avail = { P: s.c.filter((k) => I.C[k].has.P).length, H: s.c.filter((k) => I.C[k].has.H).length, N: s.c.filter((k) => I.C[k].has.N).length };
  $$("#borrower-seg [data-b]").forEach((b) => {
    const k = b.dataset.b;
    b.hidden = k !== "P" && avail[k] === 0;
    b.setAttribute("aria-pressed", String(k === s.b));
  });
  const withDsr = s.c.filter((k) => I.C[k].has.P).length;
  $("#borrower-note").textContent = s.b !== "P" ? `DSR ${s.b} có cho ${avail[s.b]}/${s.c.length} nước đang chọn.`
    : (avail.H === 0 && s.c.length ? "Không nước nào đang chọn có DSR tách H/N." : (withDsr < s.c.length ? `${withDsr}/${s.c.length} nước có DSR.` : ""));

  $$("#mode-toggle [data-v]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === s.v)));
  $$("#scatter-y [data-y]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.y === s.sy)));
  $("#yr-from").value = s.from; $("#yr-to").value = s.to; paintYears(s.from, s.to, I);
  $("#drawer-summary").textContent = `Bộ lọc · ${s.c.length} nước · ${s.from}–${s.to} · ${s.b} · ${s.v === "gap" ? "độ lệch" : "mức"}`;
  $$("nav.tabs a").forEach((a) => (a.dataset.view === s.view ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  $("#filters").hidden = s.view !== "dashboard";
}

function renderPickerList(I, getState, setState, query = "") {
  const s = getState();
  const q = norm(query.trim());
  const sel = new Set(s.c);
  const byRegion = {};
  I.D.countries.filter((c) => !q || norm(`${c.vi} ${c.en} ${c.iso2}`).includes(q))
    .sort((a, b) => a.vi.localeCompare(b.vi, "vi"))
    .forEach((c) => (byRegion[c.region] ??= []).push(c));
  const regions = Object.keys(byRegion).sort((a, b) => (REGION_VI[a] || a).localeCompare(REGION_VI[b] || b, "vi"));
  const badge = (c, b) => `<span class="badge${c.has[b] ? "" : " off"}" title="${c.has[b] ? "Có" : "Không có"} DSR ${b}">${b}</span>`;
  $("#picker-list").innerHTML = regions.length ? regions.map((r) => `<div role="group" aria-label="${esc(REGION_VI[r] || r)}">
      <div class="picker-region">${esc(REGION_VI[r] || r)}</div>${byRegion[r].map((c) => `
      <label class="picker-item"><input type="checkbox" value="${c.iso2}" ${sel.has(c.iso2) ? "checked" : ""}>
        <span>${esc(c.vi)}${c.vi !== c.en ? ` <span class="na">· ${esc(c.en)}</span>` : ""}${FOCUS.includes(c.iso2) ? ' <span class="badge">gốc</span>' : ""}</span>
        <span class="meta">${badge(c, "P")}${badge(c, "H")}${badge(c, "N")}<br>${c.last.dsr ? "DSR đến " + esc(c.last.dsr) : "không có DSR"}</span></label>`).join("")}</div>`).join("")
    : `<p style="padding:12px">Không tìm thấy nước nào khớp “${esc(query)}”.</p>`;
  $("#picker-count").textContent = `${s.c.length} nước đang chọn · ${I.D.countries.length} có trong dữ liệu`;
  $$("#picker-list input").forEach((inp) => inp.addEventListener("change", () => {
    const cur = getState().c;
    const next = inp.checked ? [...cur.filter((k) => k !== inp.value), inp.value] : cur.filter((k) => k !== inp.value);
    setState({ c: next });
    $("#picker-count").textContent = `${next.length} nước đang chọn · ${I.D.countries.length} có trong dữ liệu`;
  }));
}

/* ------------------------------------------------------------------ how-to dialog */
export function initHowto(G) {
  const dlg = $("#howto-dialog");
  let opener = null;
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-guide]");
    if (!b) return;
    const g = G.charts[b.dataset.guide];
    if (!g) return;
    opener = b;
    $("#howto-title").textContent = `Cách đọc: ${g.title}`;
    $("#howto-body").innerHTML = guideCardHTML(G, g) + `<p style="margin-top:16px"><a href="#huong-dan" data-goto-guide="${b.dataset.guide}">Xem toàn bộ hướng dẫn →</a></p>`;
    dlg.showModal();
  });
  $("#howto-close").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => opener?.focus());
  dlg.addEventListener("click", (e) => { if (e.target.closest("[data-goto-guide]")) dlg.close(); });
}

export function guideCardHTML(G, g) {
  return `<h3>Biểu đồ này cho thấy gì</h3><p>${esc(g.shows)}</p>
    <h3>Đọc thế nào</h3><p>${esc(g.how)}</p>
    <h3>Đừng hiểu nhầm</h3><ul class="dont">${g.dont.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>`;
}

/* ------------------------------------------------------------------ glossary tooltips */
export function initTerms(G) {
  const defs = Object.fromEntries(G.glossary.map((g) => [g.id, g]));
  let tip = null;
  const show = (el) => {
    const g = defs[el.dataset.term]; if (!g) return;
    hide();
    tip = document.createElement("div");
    tip.className = "tip"; tip.id = "term-tip"; tip.setAttribute("role", "tooltip");
    tip.innerHTML = `<b>${esc(g.term)}</b>${esc(g.short)}`;
    document.body.appendChild(tip);
    el.setAttribute("aria-describedby", "term-tip");
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - tip.offsetWidth - 8));
    let top = r.bottom + window.scrollY + 6;
    if (r.bottom + tip.offsetHeight + 12 > window.innerHeight) top = r.top + window.scrollY - tip.offsetHeight - 6;
    tip.style.left = `${left}px`; tip.style.top = `${top}px`;
  };
  const hide = () => { if (tip) { tip.remove(); tip = null; } $$(".term[aria-describedby]").forEach((t) => t.removeAttribute("aria-describedby")); };
  document.addEventListener("mouseover", (e) => { const t = e.target.closest(".term"); if (t) show(t); });
  document.addEventListener("mouseout", (e) => { if (e.target.closest(".term")) hide(); });
  document.addEventListener("focusin", (e) => { const t = e.target.closest(".term"); if (t) show(t); else hide(); });
  document.addEventListener("click", (e) => { const t = e.target.closest(".term"); if (t) { e.preventDefault(); tip ? hide() : show(t); } else hide(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  window.addEventListener("scroll", hide, { passive: true });
}

/** Inline glossary term: <button class="term" data-term="dsr">DSR</button>. */
export const term = (id, label) => `<button type="button" class="term" data-term="${id}">${esc(label)}</button>`;
