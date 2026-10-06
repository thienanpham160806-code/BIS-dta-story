// Small helpers shared by every module. No data logic lives here.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Vietnamese number format: decimal comma, real minus sign, optional explicit plus. */
export function vn(x, d = 1, sign = false) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const s = Math.abs(x).toFixed(d).replace(".", ",");
  if (x < 0 && Number(s.replace(",", ".")) !== 0) return "−" + s;
  return (sign && x > 0 ? "+" : "") + s;
}

/** "2026-03-31" -> "Q1/2026"; monthly -> "03/2026"; annual -> "2026". */
export function periodLabel(iso, freq) {
  if (!iso) return "—";
  const y = iso.slice(0, 4), m = +iso.slice(5, 7);
  if (freq === "Q") return `Q${Math.ceil(m / 3)}/${y}`;
  if (freq === "M") return `${String(m).padStart(2, "0")}/${y}`;
  return y;
}
export const qLabel = (iso) => periodLabel(iso, "Q");

/** Compact series {s, v} -> {x: ISO period-end dates, y}. Gaps stay null. */
export function expand(series, freq) {
  if (!series) return { x: [], y: [] };
  const [y0, m0] = series.s.split("-").map(Number);
  const step = freq === "Q" ? 3 : freq === "M" ? 1 : 12;
  const x = series.v.map((_, i) => {
    const months = m0 - 1 + i * step;
    const y = y0 + Math.floor(months / 12), m = (months % 12) + 1;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  });
  return { x, y: series.v };
}

/** Restrict to [fromYear-01-01, toYear-12-31]. */
export function clip({ x, y }, from, to) {
  const lo = `${from}-01-01`, hi = `${to}-12-31`;
  const xs = [], ys = [];
  x.forEach((d, i) => { if (d >= lo && d <= hi) { xs.push(d); ys.push(y[i]); } });
  return { x: xs, y: ys };
}

export function lastValid({ x, y }) {
  for (let i = y.length - 1; i >= 0; i--) if (y[i] !== null) return { x: x[i], y: y[i] };
  return null;
}

export function median(arr) {
  const a = arr.filter(Number.isFinite).sort((p, q) => p - q);
  if (!a.length) return NaN;
  const h = Math.floor(a.length / 2);
  return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
}

export function debounce(fn, ms = 120) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** localStorage that never throws (private mode, blocked storage, previews). */
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

export function listJoin(names, max = 4) {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} và ${names.length - max} nước khác`;
}
