import React, { useState, useRef, useEffect } from "react";
import API_BASE_URL from "../config";

// ── Confusion Matrix ─────────────────────────────────────────────────────────

function ConfusionMatrix({ matrix, classLabels, uncertainCount, onCellClick }) {
  const [asPct, setAsPct] = useState(false);
  if (!matrix || !classLabels || classLabels.length === 0) return null;
  const rowSums = matrix.map((r) => r.reduce((a, b) => a + (isFinite(b) ? b : 0), 0));
  const maxVal = Math.max(...matrix.flat().filter((v) => isFinite(v)), 1);
  const cellText = (cell, ri) => {
    if (!asPct) return cell;
    const s = rowSums[ri] || 0;
    return s ? `${Math.round((cell / s) * 100)}%` : "0%";
  };
  const intensity = (cell, ri) => (asPct ? (rowSums[ri] ? cell / rowSums[ri] : 0) : cell / maxVal);
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-400 uppercase tracking-widest">Held-out Test Confusion Matrix</p>
        <div className="flex rounded-md border border-gray-200 overflow-hidden text-[10px] font-semibold">
          {[["counts", "Counts"], ["pct", "%"]].map(([k, lbl]) => (
            <button key={k} onClick={() => setAsPct(k === "pct")}
              className={`px-2 py-1 transition-colors ${((k === "pct") === asPct) ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-600"}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs"><thead><tr>
          <th className="px-2 py-1 text-gray-300 font-normal text-right w-20 text-xs">actual ↓ pred →</th>
          {classLabels.map((l) => <th key={l} className="px-2 py-1 font-semibold text-center min-w-[56px] text-gray-500">{l}</th>)}
        </tr></thead><tbody>
          {matrix.map((row, ri) => (
            <tr key={ri}>
              <td className="px-2 py-1 text-gray-500 font-semibold text-right">{classLabels[ri]}</td>
              {row.map((cell, ci) => {
                const ok = ri === ci, int_ = intensity(cell, ri);
                const bg = ok ? `rgba(29,158,117,${0.06 + int_ * 0.4})` : cell > 0 ? `rgba(239,68,68,${0.06 + int_ * 0.28})` : "transparent";
                const clickable = onCellClick && !ok && cell > 0;
                return <td key={ci} onClick={clickable ? () => onCellClick(classLabels[ri], classLabels[ci]) : undefined}
                  title={clickable ? `Show ${classLabels[ri]} recordings predicted as ${classLabels[ci]}` : undefined}
                  className={`px-2 py-2 text-center font-bold tabular-nums rounded ${clickable ? "cursor-pointer hover:ring-1 hover:ring-red-300" : ""}`}
                  style={{ backgroundColor: bg, color: ok ? (int_ > 0.4 ? "#065f46" : "#3a3935") : cell > 0 ? "#b91c1c" : "#b0afa8" }}>{cellText(cell, ri)}</td>;
              })}
            </tr>
          ))}
        </tbody></table>
      </div>
      {uncertainCount > 0 && (
        <p className="text-[10px] text-gray-400 mt-2">
          {asPct ? "% is row-normalized (recall per class). " : "Counts show each window's best-guess class. "}
          <span className="text-amber-500 font-semibold">{uncertainCount}</span> low-confidence window{uncertainCount > 1 ? "s" : ""} (max probability &lt; 60%) are still counted above by their top prediction.
          {onCellClick ? " Click a red cell to see which recordings." : ""}
        </p>
      )}
    </div>
  );
}

// ── Score Histogram ──────────────────────────────────────────────────────────

function ScoreHistogram({ scores }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scores?.length) return;
    const dpr = window.devicePixelRatio || 1, W = canvas.offsetWidth, H = 160;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
    ctx.fillStyle = "#fbfaf6"; ctx.fillRect(0, 0, W, H);
    const nBins = 30, min = Math.min(...scores), max = Math.max(...scores);
    const range = Math.max(max - min, 1e-6), binW = range / nBins;
    const bins = new Array(nBins).fill(0);
    scores.forEach((s) => { bins[Math.min(Math.floor((s - min) / binW), nBins - 1)]++; });
    const maxBin = Math.max(...bins, 1), barW = (W - 40) / nBins;
    bins.forEach((count, i) => {
      ctx.fillStyle = "rgba(29,158,117,0.4)";
      ctx.fillRect(30 + i * barW, H - 20 - (count / maxBin) * (H - 30), barW - 1, (count / maxBin) * (H - 30));
    });
    ctx.fillStyle = "#9ca3af"; ctx.font = "9px system-ui";
    ctx.textAlign = "left"; ctx.fillText(min.toFixed(1), 30, H - 6);
    ctx.textAlign = "right"; ctx.fillText(max.toFixed(1), W - 10, H - 6);
    ctx.textAlign = "center"; ctx.fillText("Anomaly score (distance to nearest cluster)", W / 2, H - 6);
  }, [scores]);
  if (!scores?.length) return null;
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1.5">Held-out Anomaly Score Distribution</p>
      <canvas ref={canvasRef} className="w-full block rounded" style={{ height: "160px", border: "1px solid #ebeae5" }} />
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ValidateScreen({ projectId, onGoToTrain, savedResult, onResult }) {
  const [mode, setMode] = useState("classification");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(savedResult || null);
  const [error, setError] = useState(null);

  async function handleClassificationTest() {
    setTesting(true); setError(null); setResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/features/test`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server ${res.status}`);
      const r = { type: "classification", ...data };
      setResult(r); onResult?.(r);
    } catch (err) { setError(err.message); }
    finally { setTesting(false); }
  }

  async function handleAnomalyTest() {
    setTesting(true); setError(null); setResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/features/anomaly/test`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server ${res.status}`);
      const r = { type: "anomaly", ...data };
      setResult(r); onResult?.(r);
    } catch (err) { setError(err.message); }
    finally { setTesting(false); }
  }

  function handleTest() { mode === "anomaly" ? handleAnomalyTest() : handleClassificationTest(); }

  const accPct = result?.accuracy != null ? Math.round(result.accuracy * 100) : null;
  const recAccPct = result?.recording_accuracy != null ? Math.round(result.recording_accuracy * 100) : null;
  const [cellFilter, setCellFilter] = useState(null); // {exp, pred} from a clicked matrix cell

  return (
    <div className="flex flex-col min-h-0 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Model Testing</h2>
          <p className="text-xs text-gray-400 mt-1">Evaluate on held-out test recordings.</p>
        </div>
        <button onClick={() => onGoToTrain?.()} className="px-4 py-2 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50 transition-colors">← Train</button>
      </div>

      <div className="flex gap-2 mb-6">
        {[{ id: "classification", label: "Classification" }, { id: "anomaly", label: "Anomaly Detection" }].map(({ id, label }) => (
          <button key={id} onClick={() => { setMode(id); setResult(null); setError(null); }}
            className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${
              mode === id ? "border-accent text-accent bg-accent/5" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>{label}</button>
        ))}
      </div>

      {!result && (
        <div className="flex flex-col items-center gap-5 py-10">
          <p className="text-sm text-gray-400 text-center max-w-sm">
            {mode === "anomaly" ? "Score held-out windows by distance to learned clusters." : "Classify held-out test windows to measure accuracy."}
          </p>
          <button onClick={handleTest} disabled={testing || !projectId}
            className={`px-10 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all ${
              testing || !projectId ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                : "bg-accent text-white hover:bg-accent-dark shadow-md shadow-accent/25 active:scale-95"}`}>
            {testing ? "Testing…" : mode === "anomaly" ? "Score Test Set" : "Classify Test Set"}
          </button>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>
      )}

      {/* Classification results */}
      {result?.type === "classification" && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-gray-200 rounded-xl p-5">
              {(() => {
                // Lead with recording-level accuracy (how the model actually ships);
                // window-level is the harsher per-window number, shown as context.
                const headPct = recAccPct != null ? recAccPct : accPct;
                const headColor = headPct >= 90 ? "#1D9E75" : headPct >= 70 ? "#F59E0B" : "#EF4444";
                return (<>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                    Test Accuracy {recAccPct != null && <span className="normal-case tracking-normal text-gray-300">· by recording</span>}
                  </p>
                  <p className="text-4xl font-bold tabular-nums leading-none" style={{ color: headColor }}>
                    {headPct}<span className="text-lg font-normal text-gray-400">%</span></p>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${headPct}%`, backgroundColor: headColor }} /></div>
                  {recAccPct != null && (
                    <p className="text-[11px] text-gray-400 mt-2 tabular-nums">
                      {accPct}% by window · {result.n_test_recordings} recordings
                    </p>
                  )}
                </>);
              })()}
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Uncertain</p>
              <p className="text-4xl font-bold text-amber-500 tabular-nums leading-none">{result.uncertain_count}</p>
              <p className="text-xs text-gray-400 mt-2">max probability &lt; 60%</p>
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Test Windows</p>
              <p className="text-4xl font-bold text-gray-700 tabular-nums leading-none">{result.n_test_windows}</p>
            </div>
          </div>
          {(() => {
            const zeroClasses = (result.per_class || []).filter((c) => c.recall === 0).map((c) => c.label);
            const smallData = (result.n_test_windows || 0) < 60;
            if (accPct >= 70 && zeroClasses.length === 0) return null;
            return (
              <div className="flex items-start gap-2.5 border border-amber-200 bg-amber-50 rounded-xl p-4 text-xs text-amber-800">
                <span className="flex-shrink-0 text-sm leading-none mt-0.5">💡</span>
                <div className="space-y-1">
                  <p className="font-semibold">Why is accuracy low?</p>
                  {zeroClasses.length > 0 && (
                    <p><strong>{zeroClasses.join(" and ")}</strong> {zeroClasses.length > 1 ? "were" : "was"} never predicted correctly — likely being confused with a physically similar activity (e.g. walking↔jogging, sitting↔standing). Look at the confusion matrix rows below to see where they land.</p>
                  )}
                  {smallData && (
                    <p>This is a small test set ({result.n_test_windows} windows). With few examples per class, results swing a lot and under-fit is common — this usually reflects <strong>data quantity, not a broken pipeline</strong>.</p>
                  )}
                  <p className="text-amber-700">Try: record longer / more sessions per activity, add more labeled segments, increase training cycles, or confirm the classes are actually separable in the signal.</p>
                </div>
              </div>
            );
          })()}
          <div className="border border-gray-200 rounded-xl p-5">
            <ConfusionMatrix matrix={result.confusion_matrix} classLabels={result.class_labels} uncertainCount={result.uncertain_count}
              onCellClick={result.per_recording?.length ? (exp, pred) => {
                setCellFilter({ exp, pred });
                try { document.getElementById("per-recording-table")?.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* noop */ }
              } : undefined} />
          </div>
          {(result.auc_roc != null || result.weighted) && (
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Summary Metrics <span className="normal-case tracking-normal text-gray-300">· held-out test</span></p>
              <div className="grid grid-cols-4 gap-4">
                {[
                  ["AUC-ROC", result.auc_roc != null ? result.auc_roc.toFixed(2) : "—"],
                  ["Weighted Precision", result.weighted?.precision != null ? `${(result.weighted.precision * 100).toFixed(1)}%` : "—"],
                  ["Weighted Recall", result.weighted?.recall != null ? `${(result.weighted.recall * 100).toFixed(1)}%` : "—"],
                  ["Weighted F1", result.weighted?.f1 != null ? `${(result.weighted.f1 * 100).toFixed(1)}%` : "—"],
                ].map(([lbl, val]) => (
                  <div key={lbl}>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{lbl}</p>
                    <p className="text-xl font-bold text-gray-700 tabular-nums leading-none">{val}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.per_class?.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Per-class Metrics</p>
              <table className="w-full text-xs"><thead><tr className="text-gray-400 uppercase tracking-widest">
                <th className="text-left pb-2">Class</th><th className="text-right pb-2">F1</th><th className="text-right pb-2">Precision</th><th className="text-right pb-2">Recall</th>
              </tr></thead><tbody>
                {result.per_class.map((c) => <tr key={c.label} className="border-t border-gray-50">
                  <td className="py-2 font-semibold text-gray-700">{c.label}</td>
                  <td className="py-2 text-right tabular-nums text-gray-600">{(c.f1 * 100).toFixed(1)}%</td>
                  <td className="py-2 text-right tabular-nums text-gray-600">{(c.precision * 100).toFixed(1)}%</td>
                  <td className="py-2 text-right tabular-nums text-gray-600">{(c.recall * 100).toFixed(1)}%</td>
                </tr>)}
              </tbody></table>
            </div>
          )}
          {result.per_recording?.length > 0 && (() => {
            const rows = cellFilter
              ? result.per_recording.filter((r) => r.expected === cellFilter.exp && r.predicted === cellFilter.pred)
              : result.per_recording;
            return (
            <div id="per-recording-table" className="border border-gray-200 rounded-xl p-5">
              <div className="flex items-baseline justify-between mb-3">
                <p className="text-xs text-gray-400 uppercase tracking-widest">Per-recording Results</p>
                {cellFilter
                  ? <button onClick={() => setCellFilter(null)} className="text-[10px] font-semibold text-accent hover:underline">
                      showing {cellFilter.exp} → {cellFilter.pred} · clear filter ✕
                    </button>
                  : <p className="text-[10px] text-gray-400">{result.per_recording.filter((r) => !r.correct).length} of {result.per_recording.length} misclassified · failures first</p>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ minWidth: 480 }}>
                  <thead><tr className="text-gray-400 uppercase tracking-widest text-[10px]">
                    <th className="text-left pb-2">Recording</th>
                    <th className="text-left pb-2">Expected</th>
                    <th className="text-left pb-2">Predicted</th>
                    <th className="text-right pb-2">Window acc</th>
                    <th className="text-right pb-2">Confidence</th>
                    <th className="text-right pb-2"></th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.file} className="border-t border-gray-50" style={{ background: r.correct ? "transparent" : "rgba(239,68,68,0.04)" }}>
                        <td className="py-2 font-mono text-[11px] text-gray-600">{r.file}</td>
                        <td className="py-2 text-gray-700">{r.expected}</td>
                        <td className={`py-2 font-semibold ${r.correct ? "text-gray-700" : "text-red-500"}`}>{r.predicted}</td>
                        <td className="py-2 text-right tabular-nums text-gray-500">{Math.round(r.window_accuracy * 100)}%</td>
                        <td className="py-2 text-right tabular-nums text-gray-500">{Math.round(r.confidence * 100)}%</td>
                        <td className="py-2 text-right">
                          {r.correct
                            ? <span className="text-[9px] font-semibold uppercase tracking-wider text-accent bg-accent/10 rounded px-1.5 py-0.5">ok</span>
                            : <span className="text-[9px] font-semibold uppercase tracking-wider text-red-500 bg-red-50 rounded px-1.5 py-0.5">miss</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-gray-400 mt-2 leading-snug">Each recording's label is the majority vote across its windows. Recording-level accuracy is how the model performs on a full capture — the number you ship.</p>
            </div>
            );
          })()}
          <div className="flex pb-2"><button onClick={() => { setResult(null); onResult?.(null); setError(null); }}
            className="px-5 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:border-gray-400 transition-colors">← Retest</button></div>
        </div>
      )}

      {/* Anomaly results */}
      {result?.type === "anomaly" && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Test Windows</p>
              <p className="text-4xl font-bold text-gray-700 tabular-nums leading-none">{result.n_test_windows}</p>
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Threshold</p>
              <p className="text-2xl font-bold text-accent tabular-nums leading-none">{result.threshold?.toFixed(2)}</p>
              <p className="text-[10px] text-gray-400 mt-1">95th pct normal held-out</p>
            </div>
            {result.detection_rate != null && (
              <div className="border border-gray-200 rounded-xl p-5">
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Detection Rate</p>
                <p className="text-4xl font-bold text-accent tabular-nums leading-none">
                  {result.detection_rate}<span className="text-lg font-normal text-gray-400">%</span>
                </p>
                <p className="text-[10px] text-gray-400 mt-1">novel above threshold</p>
              </div>
            )}
            {result.false_positive_rate != null && (
              <div className="border border-gray-200 rounded-xl p-5">
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">False Positive</p>
                <p className={`text-4xl font-bold tabular-nums leading-none ${
                  result.false_positive_rate <= 5 ? "text-accent" : result.false_positive_rate <= 15 ? "text-amber-500" : "text-red-500"
                }`}>
                  {result.false_positive_rate}<span className="text-lg font-normal text-gray-400">%</span>
                </p>
                <p className="text-[10px] text-gray-400 mt-1">normal above threshold</p>
              </div>
            )}
          </div>

          <div className="border border-gray-200 rounded-xl p-5">
            <div className="flex gap-1.5 flex-wrap mb-3">
              <span className="text-[10px] text-gray-400 uppercase tracking-widest">Normal:</span>
              {(result.normal_classes || []).map((c) => <span key={c} className="text-[10px] font-semibold bg-accent/10 text-accent px-1.5 py-0.5 rounded">{c}</span>)}
            </div>
          </div>

          {result.novelty_readout && (
            <div className="border border-accent/20 bg-accent/5 rounded-xl p-4">
              <p className="text-xs text-accent leading-relaxed">{result.novelty_readout}</p>
              <p className="text-[9px] text-gray-400 mt-2 italic">
                Normal and novel score ranges overlap slightly; the threshold trades detection against false alarms. Unsupervised — metrics shown only because a known novel class is held out.
              </p>
            </div>
          )}

          <div className="border border-gray-200 rounded-xl p-5"><ScoreHistogram scores={result.scores} /></div>

          {result.per_class && (
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Per-class Anomaly Scores</p>
              <table className="w-full text-xs"><thead><tr className="text-gray-400 uppercase tracking-widest">
                <th className="text-left pb-2">Class</th><th className="text-right pb-2">Windows</th>
                <th className="text-right pb-2">Flagged</th>
                <th className="text-right pb-2">Mean</th><th className="text-right pb-2">Min</th><th className="text-right pb-2">Max</th><th className="text-right pb-2">Role</th>
              </tr></thead><tbody>
                {Object.entries(result.per_class).map(([cls, d]) => (
                  <tr key={cls} className="border-t border-gray-50">
                    <td className="py-2 font-semibold text-gray-700">{cls}</td>
                    <td className="py-2 text-right tabular-nums text-gray-600">{d.n_windows}</td>
                    <td className="py-2 text-right tabular-nums" style={{ color: d.n_anomalous > 0 ? (d.is_normal ? "#F59E0B" : "#1D9E75") : "#9ca3af" }}>
                      {d.n_anomalous}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gray-600">{d.mean_score.toFixed(3)}</td>
                    <td className="py-2 text-right tabular-nums text-gray-600">{d.min_score.toFixed(3)}</td>
                    <td className="py-2 text-right tabular-nums text-gray-600">{d.max_score.toFixed(3)}</td>
                    <td className="py-2 text-right">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${d.is_normal ? "bg-accent/10 text-accent" : "bg-amber-50 text-amber-600"}`}>
                        {d.is_normal ? "normal" : "novel"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}

          <div className="flex pb-2"><button onClick={() => { setResult(null); onResult?.(null); setError(null); }}
            className="px-5 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:border-gray-400 transition-colors">← Retest</button></div>
        </div>
      )}
    </div>
  );
}
