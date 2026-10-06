// "Câu chuyện dữ liệu": a fixed narrative on the four original economies, plus one
// section placing them in the global lag distribution. Every number is read from
// data.json; sentences whose direction depends on the data are chosen at run time.
import { $, css, esc, vn, qLabel, periodLabel, expand, lastValid } from "./util.js";
import { FOCUS, assignSlots, colorOf } from "./state.js";
import { timeSeries, drawLagDots, plotTemplate, lagStatus } from "./charts.js";
import { term } from "./ui.js";

const q0 = (x) => vn(x, 1).replace(",0", "");

export function renderStory(I) {
  const D = I.D;
  const C = I.C;
  const name = (k) => C[k].vi;
  const rec = (s) => I.rec[s];
  const lag = (s) => I.lag[s];
  const cyc = D.cycles;
  const dist = D.lag_dist.P;
  const u = dist.uncensored;
  const lastQ = rec("HK_P").latest_q.replace(/(\d{4})-Q(\d)/, "Q$2/$1");
  const byGap = [...FOCUS].sort((a, b) => rec(`${b}_P`).gap_now - rec(`${a}_P`).gap_now);
  const top = byGap[0];
  const above = FOCUS.filter((k) => rec(`${k}_P`).gap_now > 0);
  const allP = D.recovery.filter((r) => r.borrower === "P");
  const allAbove = allP.filter((r) => r.gap_now > 0).length;
  const hikeOrder = [...FOCUS].filter((k) => cyc[k].has_cycle).sort((a, b) => cyc[b].hike_pp - cyc[a].hike_pp);
  const hkSameAsFed = Math.abs(cyc.HK.hike_pp - cyc.US.hike_pp) < 1e-9 && cyc.HK.liftoff === cyc.US.liftoff;
  const measured = FOCUS.filter((k) => lagStatus(lag(`${k}_P`)).key === "ok");
  const insideIQR = measured.filter((k) => lag(`${k}_P`).lag_q >= u.q1 && lag(`${k}_P`).lag_q <= u.q3);
  const notMeasured = FOCUS.filter((k) => !measured.includes(k));
  const kh = lag("KR_H"), kn = lag("KR_N");
  const sm = D.cross.hike_vs_rise_small, cx = D.cross.hike_vs_rise;
  const smZero = sm.lo <= 0 && sm.hi >= 0;
  const npl = FOCUS.map((k) => ({ k, r: I.npl[k] })).filter((x) => x.r);
  const nplCIzero = npl.filter((x) => x.r.lo_change <= 0 && x.r.hi_change >= 0).length;
  const credit = (k) => lastValid(expand(D.series.credit[`${k}_P`], "Q"));
  const cens = D.lags.filter((r) => r.borrower === "P" && r.censored).map((r) => name(r.iso2));
  const noCycle = D.lags.filter((r) => r.borrower === "P" && !r.has_cycle).map((r) => name(r.iso2));
  const S = D.meta.summary;

  const lagLine = (k) => {
    const r = lag(`${k}_P`), st = lagStatus(r);
    if (st.key === "ok") return `đỉnh DSR ở ${qLabel(r.peak_q)}, tức <b>${r.lag_q} quý</b> sau lần tăng đầu tiên (${periodLabel(r.liftoff, "M")}), DSR tăng ${vn(r.rise_pp, 1)} điểm %`;
    if (st.key === "cens") return `DSR vẫn đang lên ở quý cuối của mẫu — độ trễ ít nhất ${r.lag_q} quý`;
    if (st.key === "norise") return `DSR không vượt mức trước khi tăng lãi suất, nên không có đỉnh truyền dẫn để đo`;
    return st.text;
  };

  $("#story").innerHTML = `
    <div class="kicker">Câu chuyện dữ liệu</div>
    <h1>Bốn nền kinh tế châu Á, một cú sốc lãi suất — và gánh nặng đến sau ${q0(u.median)} quý</h1>
    <p class="byline">Phạm Ngọc Thiên An · Dữ liệu BIS và World Bank đến ${esc(lastQ)} · Mọi con số được tính lại từ dữ liệu gốc</p>

    <h2>1. Cùng một cú sốc, bốn kết cục khác nhau</h2>
    <p>Hàn Quốc, Thái Lan, Malaysia và Hong Kong đều tăng lãi suất trong chu kỳ 2021–2023. Ở ${esc(lastQ)},
      ${above.length === 0 ? "cả bốn đã có" : `${above.length}/4 vẫn có`} ${term("dsr", "gánh nặng trả nợ (DSR)")} của ${term("pnfs", "khu vực tư nhân phi tài chính")}
      ${above.length === 0 ? "thấp hơn" : "cao hơn"} ${term("bench", "mức nền 20 năm")} của chính mình${above.length ? `: ${above.map((k) => `${esc(name(k))} ${vn(rec(`${k}_P`).gap_now, 1, true)} điểm %`).join(", ")}` : ""}.
      ${esc(name(top))} là nơi gánh nặng còn xa mức bình thường nhất.</p>
    <figure><h3>${esc(name(top))} vẫn cao hơn mức nền 20 năm ${vn(rec(`${top}_P`).gap_now, 1)} điểm %</h3>
      <div class="plot" id="s-gap"><div class="skeleton"></div></div>
      <figcaption>DSR khu vực tư nhân (P), chênh lệch so với trung bình 80 quý gần nhất của chính nước đó, điểm phần trăm. Đường chấm: tháng ngân hàng trung ương bắt đầu tăng lãi suất. Nguồn: BIS WS_DSR 1.0.</figcaption></figure>
    <div class="callout"><p>Vì sao so <b>độ lệch</b> chứ không so mức DSR? Mỗi nước đo thu nhập và cấu trúc khoản vay khác nhau, nên DSR ${vn(rec("HK_P").latest, 1)}% của Hong Kong và ${vn(rec("TH_P").latest, 1)}% của Thái Lan không nói nước nào "nặng nợ" hơn. BIS khuyến nghị so với lịch sử của chính nước đó.</p></div>

    <h2>2. Nợ nhiều không có nghĩa là trả nợ nặng</h2>
    <p>${term("creditgdp", "Tín dụng/GDP")} đo <i>quy mô</i> nợ; DSR đo <i>dòng tiền</i> phải trả mỗi kỳ. Ở ${esc(qLabel(credit("HK").x))},
      dư nợ khu vực tư nhân so với GDP là ${FOCUS.map((k) => `${esc(name(k))} ${vn(credit(k).y, 0)}%`).join(", ")}.
      Hai chỉ tiêu có thể đi ngược chiều: khi lãi suất tăng, phần phải trả trên cùng một khoản nợ tăng lên, dù dư nợ đứng yên hoặc giảm.</p>

    <h2>3. Cường độ cú sốc rất khác nhau</h2>
    <p>Tính từ đáy đến đỉnh của chu kỳ, lãi suất chính sách tăng: ${hikeOrder.map((k) => `${esc(name(k))} <b>+${vn(cyc[k].hike_pp, 2)}</b> điểm %`).join(", ")}.
      ${hkSameAsFed ? `Hong Kong tăng đúng bằng Fed (+${vn(cyc.US.hike_pp, 2)} điểm %) và cùng tháng ${periodLabel(cyc.US.liftoff, "M")}: với cơ chế neo tỷ giá theo USD, HKMA không có lựa chọn khác.`
        : `Hong Kong neo tỷ giá theo USD nên lãi suất đi theo Fed (Fed tăng +${vn(cyc.US.hike_pp, 2)} điểm %).`}</p>
    <figure><h3>${esc(name(hikeOrder[0]))} tăng lãi suất nhiều nhất trong bốn nước</h3>
      <div class="plot" id="s-policy"><div class="skeleton"></div></div>
      <figcaption>Lãi suất chính sách cuối tháng, % / năm; đường xám là Fed để tham chiếu. Nguồn: BIS WS_CBPOL 1.0.</figcaption></figure>

    <h2>4. Gánh nặng không đến ngay</h2>
    <p>${term("liftoff", "Mốc bắt đầu tăng")} được xác định bằng thuật toán cho từng nước, rồi đo ${term("lag", "độ trễ")} đến quý DSR cao nhất (độ chính xác ±1 quý):</p>
    <ul>${FOCUS.map((k) => `<li><b>${esc(name(k))}</b>: ${lagLine(k)}.</li>`).join("")}</ul>
    <p>Hàn Quốc là nước duy nhất trong bốn có số tách ${term("hnp", "hộ gia đình (H) và doanh nghiệp (N)")}:
      doanh nghiệp đạt đỉnh sau ${kn.lag_q} quý (${vn(kn.rise_pp, 1, true)} điểm %), hộ gia đình sau ${kh.lag_q} quý (${vn(kh.rise_pp, 1, true)} điểm %)
      — ${kn.lag_q < kh.lag_q ? "doanh nghiệp ngấm đòn trước" : kn.lag_q > kh.lag_q ? "hộ gia đình ngấm đòn trước" : "cùng thời điểm"}, và ${Math.abs(kn.rise_pp) > Math.abs(kh.rise_pp) ? "doanh nghiệp chịu mức tăng lớn hơn" : "hộ gia đình chịu mức tăng lớn hơn"}.</p>

    <h2>5. Bốn nước trong bức tranh toàn cầu</h2>
    <p>Áp dụng cùng một thuật toán cho mọi nền kinh tế BIS công bố DSR (${S.with_dsr} nước), đỉnh DSR đến sau
      <b>trung vị ${q0(u.median)} quý</b> kể từ lúc tăng lãi suất, khoảng tứ phân vị ${q0(u.q1)}–${q0(u.q3)} quý (n = ${u.n}).
      ${cens.length ? `${cens.length} chuỗi bị ${term("censored", "cắt cụt")} (${esc(cens.join(", "))}): đỉnh rơi vào quý cuối nên độ trễ thật có thể dài hơn; tính cả chúng như cận dưới, ước lượng Kaplan–Meier vẫn là ${q0(dist.km_median)} quý.` : ""}
      ${noCycle.length ? `${esc(noCycle.join(" và "))} không tăng lãi suất trong cửa sổ này nên bị loại.` : ""}</p>
    <p>${insideIQR.length === measured.length && measured.length
        ? `Cả ${measured.length} nước gốc có đỉnh đo được (${esc(measured.map(name).join(", "))}) đều nằm trong khoảng tứ phân vị: về <i>thời gian</i>, câu chuyện của bốn nước không phải ngoại lệ.`
        : `${insideIQR.length}/${measured.length} nước gốc có đỉnh đo được nằm trong khoảng tứ phân vị toàn cầu.`}
      ${notMeasured.length ? `${esc(notMeasured.map(name).join(", "))} không có độ trễ đo được (xem mục 4).` : ""}</p>
    <figure><h3>Đỉnh DSR đến sau trung vị ${q0(u.median)} quý trên ${u.n} nền kinh tế</h3>
      <div class="plot" id="s-lag" style="height:300px"><div class="skeleton"></div></div>
      <figcaption>Mỗi chấm là một nền kinh tế (DSR P). Vùng tô: khoảng tứ phân vị; vạch đứt: trung vị; chấm rỗng: bị cắt cụt. Nguồn: BIS WS_DSR, WS_CBPOL.</figcaption></figure>
    <p>Khác biệt giữa các nước nằm nhiều hơn ở <i>độ lớn</i>. Giữa các nền kinh tế, mức tăng lãi suất có tương quan với mức tăng DSR
      (r = ${vn(cx.r, 2)}, n = ${cx.n}), nhưng ${smZero
        ? `khi bỏ ${sm.excluded.length} chu kỳ tăng trên ${vn(sm.threshold_pp, 0)} điểm % (${esc(sm.excluded.map(name).join(", "))}), hệ số chỉ còn ${vn(sm.r, 2)} với khoảng tin cậy 95% chứa 0. Kết luận "tăng mạnh thì gánh nặng tăng mạnh" phụ thuộc vào vài nước lạm phát cao`
        : `quan hệ vẫn còn khi bỏ các chu kỳ trên ${vn(sm.threshold_pp, 0)} điểm % (r = ${vn(sm.r, 2)}, n = ${sm.n})`}.
      Đây là tương quan mô tả, không phải nhân quả.</p>

    <h2>6. Nợ xấu chưa đi theo</h2>
    <p>Nếu gánh nặng trả nợ biến thành vỡ nợ, ${term("npl", "tỷ lệ nợ xấu (NPL)")} phải tăng theo. Tương quan biến động hằng năm giữa DSR và NPL:
      ${npl.map(({ k, r }) => `${esc(name(k))} r = ${vn(r.r_change, 2)} (KTC 95% ${vn(r.lo_change, 2)} … ${vn(r.hi_change, 2)}, n = ${r.n_change})`).join("; ")}.
      Khoảng tin cậy chứa 0 ở ${nplCIzero}/${npl.length} nước: với số năm ít như vậy, dữ liệu không đủ để nói hai chỉ tiêu đi cùng nhau. Chỉ mang tính mô tả.</p>

    <h2>7. Đã hồi phục tới đâu</h2>
    <p>${FOCUS.map((k) => { const r = rec(`${k}_P`);
        return Number.isFinite(r.unwound_pct) ? (r.unwound_pct >= 100
            ? `${esc(name(k))} đã gỡ hết phần vượt mức nền và xuống dưới mức đó (từ ${vn(r.gap_peak, 1, true)} xuống ${vn(r.gap_now, 1, true)} điểm %)`
            : `${esc(name(k))} đã gỡ ${vn(r.unwound_pct, 0)}% phần vượt mức nền lúc đỉnh (từ ${vn(r.gap_peak, 1, true)} xuống ${vn(r.gap_now, 1, true)} điểm %)`)
          : `${esc(name(k))} chưa từng vượt mức nền đáng kể trong chu kỳ này (hiện ${vn(r.gap_now, 1, true)} điểm %)`; }).join("; ")}.
      Trên toàn bộ ${allP.length} nền kinh tế, ${allAbove} vẫn ở trên mức nền 20 năm.</p>
    <figure><h3>Từ đỉnh chu kỳ đến ${esc(lastQ)}: độ lệch so với mức nền</h3>
      <div class="plot" id="s-rec" style="height:260px"><div class="skeleton"></div></div>
      <figcaption>Chấm rỗng: độ lệch lúc DSR đạt đỉnh sau khi tăng lãi suất; chấm đặc: quý mới nhất. Điểm phần trăm. Nguồn: BIS WS_DSR 1.0.</figcaption></figure>

    <h2>8. Giới hạn</h2>
    <ul>
      <li>Độ trễ đo bằng một đỉnh duy nhất trên chuỗi quý (±1 quý), và chỉ cho chu kỳ tăng ${esc(D.meta.cycle_window[0].slice(0, 4))}–${esc(D.meta.cycle_window[1].slice(0, 4))}.</li>
      <li>BIS chỉ công bố DSR tách hộ gia đình/doanh nghiệp cho ${S.with_dsr_breakdown_HN} nền kinh tế; Thái Lan, Malaysia, Hong Kong chỉ có số tổng.</li>
      <li>DSR của BIS dựa trên giả định kỳ hạn còn lại và cơ cấu trả nợ cố định; mức tuyệt đối không so được giữa các nước.</li>
      <li>NPL là số năm, toàn hệ thống ngân hàng, và một số nước chưa có năm gần nhất (${esc(FOCUS.filter((k) => I.npl[k] && I.npl[k].npl_last_year < +S.latest.npl).map((k) => `${name(k)}: đến ${I.npl[k].npl_last_year}`).join(", ") || "không có trong bốn nước gốc")}).</li>
      <li>Không có dự báo: mọi biểu đồ dừng ở kỳ dữ liệu mới nhất.</li>
    </ul>`;

  // ---- figures
  const slots = assignSlots(FOCUS);
  const ctx = { I, slots, s: { c: FOCUS, from: 2016, to: I.maxYear, b: "P", v: "gap" } };
  const ds = D.series.gap;
  timeSeries($("#s-gap"), ctx, {
    get: (k) => ds[`${k}_P`], freq: "Q", unit: "pp so với mức nền", hoverFmt: "+.1f", labelFmt: (v) => vn(v, 1, true),
    tickSuffix: " pp", zero: true, vlines: FOCUS.map((k) => ({ x: cyc[k].liftoff, color: colorOf(slots, k) })), emptyCell: "",
  });
  const pctx = { ...ctx, s: { ...ctx.s, from: 2019 } };
  const groups = [...FOCUS.map((k) => ({ keys: [k], label: name(k), color: colorOf(slots, k) })),
    { keys: ["US"], label: "Mỹ (Fed)", color: css("--muted") }];
  timeSeries($("#s-policy"), pctx, {
    groups, get: (k) => D.series.policy[k], freq: "M", unit: "%/năm", hoverFmt: ".2f", labelFmt: (v) => vn(v, 2) + "%", tickSuffix: "%", emptyCell: "",
  });
  drawLagDots($("#s-lag"), ctx, "P");
  drawRecovery($("#s-rec"), I, slots, [...FOCUS.map((k) => `${k}_P`), "KR_H", "KR_N"]);
}

function drawRecovery(el, I, slots, series) {
  const rows = series.map((s) => I.rec[s]).filter(Boolean);
  const label = (r) => `${I.C[r.iso2].vi}${r.borrower !== "P" ? (r.borrower === "H" ? " · hộ GĐ" : " · DN") : ""}`;
  const y = rows.map(label);
  const traces = [];
  rows.forEach((r, i) => {
    const col = colorOf(slots, r.iso2);
    if (Number.isFinite(r.gap_peak)) traces.push({ x: [r.gap_peak, r.gap_now], y: [y[i], y[i]], mode: "lines", line: { color: css("--rule-2"), width: 3 }, hoverinfo: "skip", type: "scatter" });
    traces.push({ x: [r.gap_peak], y: [y[i]], mode: "markers", type: "scatter", marker: { size: 11, color: css("--surface"), line: { color: col, width: 2 } },
      hovertemplate: `<b>${esc(y[i])}</b><br>Lúc đỉnh: %{x:+.1f} pp<extra></extra>` });
    traces.push({ x: [r.gap_now], y: [y[i]], mode: "markers+text", type: "scatter", text: [vn(r.gap_now, 1, true)], textposition: "top center",
      textfont: { color: css("--ink"), size: 12 }, marker: { size: 12, color: col },
      hovertemplate: `<b>${esc(y[i])}</b><br>${esc(r.latest_q.replace(/(\d{4})-Q(\d)/, "Q$2/$1"))}: %{x:+.1f} pp<extra></extra>` });
  });
  const L = plotTemplate();
  L.margin = { l: 8, r: 40, t: 8, b: 8 };
  L.xaxis = { ...L.xaxis, showgrid: true, zeroline: true, zerolinecolor: css("--ink-2"), ticksuffix: " pp", title: { text: "điểm phần trăm so với mức nền 20 năm" } };
  L.yaxis = { ...L.yaxis, autorange: "reversed", type: "category", showgrid: false, tickfont: { color: css("--ink"), size: 12.5 } };
  el.innerHTML = "";
  window.Plotly.react(el, traces, L, { displayModeBar: false, responsive: true });
}
