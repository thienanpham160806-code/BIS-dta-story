// First-visit tour: highlights the real controls, one step at a time.
import { $, esc, store } from "./util.js";

const SEEN_KEY = "tour-seen-v1";
export const tourSeen = () => store.get(SEEN_KEY) === "1";

function visible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

export function startTour(steps, { beforeStart } = {}) {
  beforeStart?.();
  const opener = document.activeElement;
  let i = 0;
  const mask = Object.assign(document.createElement("div"), { className: "tour-mask" });
  const hole = Object.assign(document.createElement("div"), { className: "tour-hole" });
  const pop = Object.assign(document.createElement("div"), { className: "tour-pop" });
  pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true"); pop.setAttribute("aria-labelledby", "tour-title");
  document.body.append(mask, hole, pop);

  const end = () => {
    store.set(SEEN_KEY, "1");
    mask.remove(); hole.remove(); pop.remove();
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", place);
    opener?.focus?.();
  };
  const target = () => {
    const st = steps[i];
    const el = document.querySelector(st.target);
    // On a phone the filters live in a closed drawer: point at the drawer button instead.
    return visible(el) ? el : document.querySelector("#drawer-btn");
  };
  function place() {
    const el = target();
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 6;
    Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const pw = pop.offsetWidth, ph = pop.offsetHeight, vw = innerWidth, vh = innerHeight;
    let top = r.bottom + 14;
    if (top + ph > vh - 8) top = Math.max(8, r.top - ph - 14);
    if (top + ph > vh - 8) top = Math.max(8, vh - ph - 8);
    const left = Math.max(8, Math.min(r.left, vw - pw - 8));
    Object.assign(pop.style, { left: `${left}px`, top: `${top}px` });
  }
  function show() {
    const st = steps[i];
    const el = target();
    el?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    pop.innerHTML = `<h2 id="tour-title">${esc(st.title)}</h2><p>${esc(st.body)}</p>
      <div class="tour-nav"><span class="count">${i + 1} / ${steps.length}</span>
        <button class="btn" type="button" data-t="skip">Bỏ qua</button>
        ${i > 0 ? '<button class="btn" type="button" data-t="prev">Quay lại</button>' : ""}
        <button class="btn primary" type="button" data-t="next">${i === steps.length - 1 ? "Xong" : "Tiếp"}</button></div>`;
    setTimeout(place, 320); place();
    pop.querySelector('[data-t="next"]').focus();
  }
  pop.addEventListener("click", (e) => {
    const a = e.target.closest("[data-t]")?.dataset.t;
    if (a === "skip") end();
    else if (a === "prev") { i--; show(); }
    else if (a === "next") { if (i === steps.length - 1) end(); else { i++; show(); } }
  });
  mask.addEventListener("click", end);
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); end(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); if (i < steps.length - 1) { i++; show(); } }
    else if (e.key === "ArrowLeft") { e.preventDefault(); if (i > 0) { i--; show(); } }
    else if (e.key === "Tab") {                       // keep focus inside the popover
      const f = [...pop.querySelectorAll("button")];
      const idx = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(idx + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  }
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", place);
  show();
}
