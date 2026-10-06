// Data index, filter state <-> URL, and the colour assignment rule.
import { css } from "./util.js";

export const FOCUS = ["KR", "TH", "MY", "HK"];
export const VIEWS = { "bang-dieu-khien": "dashboard", "cau-chuyen": "story", "huong-dan": "guide" };
export const HASH = Object.fromEntries(Object.entries(VIEWS).map(([h, v]) => [v, h]));
const ASIA_REGIONS = ["East Asia & Pacific", "South Asia"];
const OCEANIA = ["AU", "NZ"];

/** One-time index over data.json so every lookup below is O(1). */
export function buildIndex(D) {
  const C = Object.fromEntries(D.countries.map((c) => [c.iso2, c]));
  const lag = Object.fromEntries(D.lags.map((r) => [r.series, r]));
  const rec = Object.fromEntries(D.recovery.map((r) => [r.series, r]));
  const npl = Object.fromEntries(D.npl_corr.map((r) => [r.iso2, r]));
  const economies = D.countries.filter((c) => !c.aggregate);
  const maxYear = +D.meta.summary.latest.dsr.slice(0, 4);
  const minYear = Math.min(...Object.values(D.series.dsr).map((s) => +s.s.slice(0, 4)));
  const recP = D.recovery.filter((r) => r.borrower === "P");
  const groups = {
    focus: FOCUS,
    asia: economies.filter((c) => ASIA_REGIONS.includes(c.region) && !OCEANIA.includes(c.iso2)).map((c) => c.iso2),
    euro: economies.filter((c) => c.euro).map((c) => c.iso2),
    advanced: economies.filter((c) => c.group === "advanced").map((c) => c.iso2),
    emerging: economies.filter((c) => c.group === "emerging").map((c) => c.iso2),
  };
  const tokens = {
    "@latest": maxYear,
    "@euro_dsr": economies.filter((c) => c.euro && c.has.P).map((c) => c.iso2),
    "@above_bench_top6": recP.filter((r) => r.gap_now > 0).sort((a, b) => b.gap_now - a.gap_now).slice(0, 6).map((r) => r.iso2),
  };
  return { D, C, lag, rec, npl, economies, minYear, maxYear, groups, tokens };
}

export function defaults(I) {
  return { c: [...FOCUS], from: 2016, to: I.maxYear, b: "P", v: "gap", sy: "rise", view: "dashboard" };
}

export function parseURL(I) {
  const d = defaults(I);
  const q = new URLSearchParams(location.search);
  const s = { ...d };
  if (q.has("c")) {
    const seen = new Set();
    s.c = q.get("c").split(",").map((x) => x.trim().toUpperCase()).filter((x) => I.C[x] && !seen.has(x) && seen.add(x));
  }
  const yr = (k) => { const n = parseInt(q.get(k), 10); return Number.isFinite(n) ? Math.min(I.maxYear, Math.max(I.minYear, n)) : d[k]; };
  s.from = yr("from"); s.to = yr("to");
  if (s.from > s.to) [s.from, s.to] = [s.to, s.from];
  if (["P", "H", "N"].includes(q.get("b"))) s.b = q.get("b");
  if (["gap", "level"].includes(q.get("v"))) s.v = q.get("v");
  if (["rise", "lag"].includes(q.get("sy"))) s.sy = q.get("sy");
  s.view = VIEWS[location.hash.slice(1)] || "dashboard";
  return s;
}

export function toURL(s, I) {
  const d = defaults(I);
  const q = new URLSearchParams();
  q.set("c", s.c.join(","));
  q.set("from", s.from); q.set("to", s.to); q.set("b", s.b);
  if (s.v !== d.v) q.set("v", s.v);
  if (s.sy !== d.sy) q.set("sy", s.sy);
  return `${location.pathname}?${q.toString().replace(/%2C/g, ",")}#${HASH[s.view]}`;
}

/** Resolve a guide preset ("@token" values allowed) into a full state. */
export function resolvePreset(p, I) {
  const r = (v) => (typeof v === "string" && v.startsWith("@") ? I.tokens[v] : v);
  return { ...defaults(I), ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, r(v)])) };
}

/**
 * Colour follows the economy, never its rank:
 *  - slots 1-4 are pinned to KR, TH, MY, HK;
 *  - any other economy takes the lowest free slot (5-8 first, then unused pinned
 *    slots) in the order it appears in the URL, and keeps it on every chart.
 *  - beyond eight there is no ninth hue: such economies get null and charts switch
 *    to small multiples, where identity is carried by the panel title.
 */
export function assignSlots(list) {
  const slot = {};
  const used = new Set();
  list.forEach((k) => { const i = FOCUS.indexOf(k); if (i >= 0) { slot[k] = i + 1; used.add(i + 1); } });
  const order = [5, 6, 7, 8, 1, 2, 3, 4];
  list.forEach((k) => {
    if (slot[k]) return;
    const free = order.find((n) => !used.has(n));
    slot[k] = free ?? null;
    if (free) used.add(free);
  });
  return slot;
}

export function colorOf(slots, k) {
  return slots[k] ? css(`--cat-${slots[k]}`) : css("--ink-2");
}
