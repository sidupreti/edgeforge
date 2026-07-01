import React, { useState, useRef, useEffect } from "react";
import API_BASE_URL from "../config";

// ── Confusion Matrix ─────────────────────────────────────────────────────────

function ConfusionMatrix({ matrix, classLabels, uncertainCount }) {
  if (!matrix || !classLabels || classLabels.length === 0) return null;
  const allCols = [...classLabels];
  if (uncertainCount > 0) allCols.push("Uncertain");
  const maxVal = Math.max(...matrix.flat().filter((v) => isFinite(v)), 1);
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Held-out Test Confusion Matrix</p>
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="px-2 py-1 text-gray-300 font-normal text-right w-20 text-xs">actual ↓ pred →</th>
              {allCols.map((l) => (
                <th key={l} className={`px-2 py-1 font-semibold text-center min-w-[56px] ${l === "Uncertain" ? "text-amber-500" : "text-gray-500"}`}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, ri) => (
              <tr key={ri}>
                <td className="px-2 py-1 text-gray-500 font-semibold text-right">{classLabels[ri]}</td>
                {row.map((cell, ci) => {
                  const ok = ri === ci, int_ = cell / maxVal;
                  const bg = ok ? `rgba(29,158,117,${0.06 + int_ * 0.4})` : cell > 0 ? `rgba(239,68,68,${0.06 + int_ * 0.28})` : "transparent";
                  return (
                    <td key={ci} className="px-2 py-2 text-center font-bold tabular-nums rounded"
                      style={{ backgroundColor: bg, color: ok ? (int_ > 0.4 ? "#065f46" : "#3a3935") : cell > 0 ? "#b91c1c" : "#b0afa8" }}>
                      {cell}
                    </td>
                  );
                })}
                {uncertainCount > 0 && <td className="px-2 py-2 text-center tabular-nums text-gray-300">—</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Score Histogram (anomaly, no threshold) ──────────────────────────────────

function ScoreHistogram({ scores, labels }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scores?.length) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = 160;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
    ctx.fillStyle = "#fbfaf6"; ctx.fillRect(0, 0, W, H);

    const nBins = 30;
    const min = Math.min(...scores), max = Math.max(...scores);
    const range = Math.max(max - min, 1e-6);
    const binW = range / nBins;
    const bins = new Array(nBins).fill(0);
    scores.forEach((s) => { const bi = Math.min(Math.floor((s - min) / binW), nBins - 1); bins[bi]++; });
    const maxBin = Math.max(...bins, 1);
    const barW = (W - 40) / nBins;

    bins.forEach((count, i) => {
      const x = 30 + i * barW;
      const h = (count / maxBin) * (H - 30);
      ctx.fillStyle = "rgba(29,158,117,0.4)";
      ctx.fillRect(x, H - 20 - h, barW - 1, h);
    });

    ctx.fillStyle = "#9ca3af"; ctx.font = "9px system-ui"; ctx.textAlign = "left";
    ctx.fillText(min.toFixed(1), 30, H - 6);
    ctx.textAlign = "right";
    ctx.fillText(max.toFixed(1), W - 10, H - 6);
    ctx.textAlign = "center";
    ctx.fillText("Anomaly score (distance to nearest cluster)", W / 2, H - 6);
  }, [scores, labels]);

  if (!scores?.length) return null;
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1.5">Held-out Anomaly Score Distribution</p>
      <canvas ref={canvasRef} className="w-full block rounded" style={{ height: "160px", border: "1px solid #ebeae5" }} />
      <p className="text-[9px] text-gray-400 mt-1 italic">
        Higher score = window is farther from learned clusters = more unlike training data.
      </p>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ValidateScreen({ projectId, onGoToTrain }) {
  const [mode, setMode]       = useState("classification");
  const [testing, setTesting] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);

  async function handleClassificationTest() {
    setTesting(true); setError(null); setResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/features/test`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server ${res.status}`);
      setResult({ type: "classification", ...data });
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
      setResult({ type: "anomaly", ...data });
    } catch (err) { setError(err.message); }
    finally { setTesting(false); }
  }

  function handleTest() {
    if (mode === "anomaly") handleAnomalyTest();
    else handleClassificationTest();
  }

  const accPct = result?.accuracy != null ? Math.round(result.accuracy * 100) : null;

  return (
    <div className="flex flex-col min-h-0 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Model Testing</h2>
          <p className="text-xs text-gray-400 mt-1">Evaluate on held-out test recordings.</p>
        </div>
        <button onClick={() => onGoToTrain?.()} className="px-4 py-2 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50 transition-colors">
          ← Train
        </button>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-6">
        {[{ id: "classification", label: "Classification" }, { id: "anomaly", label: "Anomaly Detection" }].map(({ id, label }) => (
          <button key={id}
            onClick={() => { setMode(id); setResult(null); setError(null); }}
            className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${
              mode === id ? "border-accent text-accent bg-accent/5" : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}>{label}</button>
        ))}
      </div>

      {/* Test button */}
      {!result && (
        <div className="flex flex-col items-center gap-5 py-10">
          <p className="text-sm text-gray-400 text-center max-w-sm">
            {mode === "anomaly"
              ? "Score held-out windows by distance to learned clusters (raw anomaly scores)."
              : "Classify held-out test windows to measure real-world accuracy."}
          </p>
          <button onClick={handleTest} disabled={testing || !projectId}
            className={`px-10 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all ${
              testing || !projectId
                ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                : "bg-accent text-white hover:bg-accent-dark shadow-md shadow-accent/25 active:scale-95"
            }`}>
            {testing ? "Testing…" : mode === "anomaly" ? "Score Test Set" : "Classify Test Set"}
          </button>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>
      )}

      {/* ── Classification results ──────────────────────────────────────── */}
      {result?.type === "classification" && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Test Accuracy</p>
              <p className={`text-4xl font-bold tabular-nums leading-none ${accPct >= 90 ? "text-accent" : accPct >= 70 ? "text-amber-500" : "text-red-500"}`}>
                {accPct}<span className="text-lg font-normal text-gray-400">%</span>
              </p>
              <div className="w-full h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${accPct}%`, backgroundColor: accPct >= 90 ? "#1D9E75" : accPct >= 70 ? "#F59E0B" : "#EF4444" }} />
              </div>
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
          <div className="border border-gray-200 rounded-xl p-5">
            <ConfusionMatrix matrix={result.confusion_matrix} classLabels={result.class_labels} uncertainCount={result.uncertain_count} />
          </div>
          {result.per_class?.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Per-class Metrics</p>
              <table className="w-full text-xs">
                <thead><tr className="text-gray-400 uppercase tracking-widest">
                  <th className="text-left pb-2">Class</th><th className="text-right pb-2">F1</th>
                  <th className="text-right pb-2">Precision</th><th className="text-right pb-2">Recall</th>
                </tr></thead>
                <tbody>
                  {result.per_class.map((c) => (
                    <tr key={c.label} className="border-t border-gray-50">
                      <td className="py-2 font-semibold text-gray-700">{c.label}</td>
                      <td className="py-2 text-right tabular-nums text-gray-600">{(c.f1 * 100).toFixed(1)}%</td>
                      <td className="py-2 text-right tabular-nums text-gray-600">{(c.precision * 100).toFixed(1)}%</td>
                      <td className="py-2 text-right tabular-nums text-gray-600">{(c.recall * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-3 pb-2">
            <button onClick={() => { setResult(null); setError(null); }}
              className="px-5 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:border-gray-400 transition-colors">← Retest</button>
          </div>
        </div>
      )}

      {/* ── Anomaly results (raw scores only) ───────────────────────────── */}
      {result?.type === "anomaly" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Test Windows</p>
              <p className="text-4xl font-bold text-gray-700 tabular-nums leading-none">{result.n_test_windows}</p>
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Score Range</p>
              <p className="text-lg font-bold text-gray-700 tabular-nums leading-none">
                {Math.min(...(result.scores || [0])).toFixed(2)} — {Math.max(...(result.scores || [0])).toFixed(2)}
              </p>
              <p className="text-xs text-gray-400 mt-2">distance to nearest cluster center</p>
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl p-5">
            <ScoreHistogram scores={result.scores} labels={result.labels} />
          </div>

          {result.per_class && (
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Per-class Anomaly Scores</p>
              <p className="text-[10px] text-gray-400 mb-3 italic">
                Unsupervised novelty scoring — higher mean score indicates windows farther from learned clusters.
              </p>
              <table className="w-full text-xs">
                <thead><tr className="text-gray-400 uppercase tracking-widest">
                  <th className="text-left pb-2">Class</th><th className="text-right pb-2">Windows</th>
                  <th className="text-right pb-2">Mean Score</th><th className="text-right pb-2">Min</th>
                  <th className="text-right pb-2">Max</th>
                </tr></thead>
                <tbody>
                  {Object.entries(result.per_class).map(([cls, d]) => (
                    <tr key={cls} className="border-t border-gray-50">
                      <td className="py-2 font-semibold text-gray-700">{cls}</td>
                      <td className="py-2 text-right tabular-nums text-gray-600">{d.n_windows}</td>
                      <td className="py-2 text-right tabular-nums text-gray-600">{d.mean_score.toFixed(3)}</td>
                      <td className="py-2 text-right tabular-nums text-gray-600">{d.min_score.toFixed(3)}</td>
                      <td className="py-2 text-right tabular-nums text-gray-600">{d.max_score.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-3 pb-2">
            <button onClick={() => { setResult(null); setError(null); }}
              className="px-5 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:border-gray-400 transition-colors">← Retest</button>
          </div>
        </div>
      )}
    </div>
  );
}
