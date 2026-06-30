import React, { useState } from "react";
import API_BASE_URL from "../config";

// ── Confusion Matrix (with optional Uncertain column) ────────────────────────

function ConfusionMatrix({ matrix, classLabels, uncertainCount }) {
  if (!matrix || !classLabels || classLabels.length === 0) return null;

  const allCols = [...classLabels];
  if (uncertainCount > 0) allCols.push("Uncertain");
  const maxVal = Math.max(...matrix.flat().filter((v) => isFinite(v)), 1);

  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">
        Held-out Test Confusion Matrix
      </p>
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="px-2 py-1 text-gray-300 font-normal text-right w-20 text-xs">
                actual ↓ pred →
              </th>
              {allCols.map((label) => (
                <th
                  key={label}
                  className={`px-2 py-1 font-semibold text-center min-w-[56px] ${
                    label === "Uncertain" ? "text-amber-500" : "text-gray-500"
                  }`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, ri) => (
              <tr key={ri}>
                <td className="px-2 py-1 text-gray-500 font-semibold text-right">
                  {classLabels[ri]}
                </td>
                {row.map((cell, ci) => {
                  const isCorrect = ri === ci;
                  const intensity = cell / maxVal;
                  const bg = isCorrect
                    ? `rgba(29,158,117,${0.06 + intensity * 0.40})`
                    : cell > 0
                    ? `rgba(239,68,68,${0.06 + intensity * 0.28})`
                    : "transparent";
                  return (
                    <td
                      key={ci}
                      className="px-2 py-2 text-center font-bold tabular-nums rounded"
                      style={{
                        backgroundColor: bg,
                        color: isCorrect ? (intensity > 0.4 ? "#065f46" : "#3a3935") : cell > 0 ? "#b91c1c" : "#b0afa8",
                      }}
                    >
                      {cell}
                    </td>
                  );
                })}
                {uncertainCount > 0 && (
                  <td className="px-2 py-2 text-center tabular-nums text-gray-300">—</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ValidateScreen({ projectId, onGoToTrain }) {
  const [testing, setTesting]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);

  async function handleTest() {
    setTesting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/features/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server ${res.status}`);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  }

  const accPct = result ? Math.round(result.accuracy * 100) : null;

  return (
    <div className="flex flex-col min-h-0 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Model Testing</h2>
          <p className="text-xs text-gray-400 mt-1">
            Evaluate on held-out test recordings (not seen during training).
          </p>
        </div>
        <button
          onClick={() => onGoToTrain?.()}
          className="px-4 py-2 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
        >
          ← Train
        </button>
      </div>

      {/* Test button */}
      {!result && (
        <div className="flex flex-col items-center gap-5 py-12">
          <div className="w-14 h-14 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-gray-400 text-center max-w-sm">
            Run the trained model against the held-out test set to measure real-world accuracy.
          </p>
          <button
            onClick={handleTest}
            disabled={testing || !projectId}
            className={`px-10 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all ${
              testing || !projectId
                ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                : "bg-accent text-white hover:bg-accent-dark shadow-md shadow-accent/25 active:scale-95"
            }`}
          >
            {testing ? "Testing…" : "Classify Test Set"}
          </button>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Accuracy + uncertain tiles */}
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Test Accuracy</p>
              <p className={`text-4xl font-bold tabular-nums leading-none ${
                accPct >= 90 ? "text-accent" : accPct >= 70 ? "text-amber-500" : "text-red-500"
              }`}>
                {accPct}<span className="text-lg font-normal text-gray-400">%</span>
              </p>
              <div className="w-full h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${accPct}%`,
                    backgroundColor: accPct >= 90 ? "#1D9E75" : accPct >= 70 ? "#F59E0B" : "#EF4444",
                  }}
                />
              </div>
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Uncertain</p>
              <p className="text-4xl font-bold text-amber-500 tabular-nums leading-none">
                {result.uncertain_count}
              </p>
              <p className="text-xs text-gray-400 mt-2">
                windows with max probability &lt; 60%
              </p>
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Test Windows</p>
              <p className="text-4xl font-bold text-gray-700 tabular-nums leading-none">
                {result.n_test_windows}
              </p>
            </div>
          </div>

          {/* Confusion matrix */}
          <div className="border border-gray-200 rounded-xl p-5">
            <ConfusionMatrix
              matrix={result.confusion_matrix}
              classLabels={result.class_labels}
              uncertainCount={result.uncertain_count}
            />
          </div>

          {/* Per-class F1 */}
          {result.per_class?.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Per-class Metrics</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 uppercase tracking-widest">
                    <th className="text-left pb-2">Class</th>
                    <th className="text-right pb-2">F1</th>
                    <th className="text-right pb-2">Precision</th>
                    <th className="text-right pb-2">Recall</th>
                  </tr>
                </thead>
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

          {/* Back to retrain */}
          <div className="flex gap-3 pb-2">
            <button
              onClick={() => { setResult(null); setError(null); }}
              className="px-5 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:border-gray-400 transition-colors"
            >
              ← Retest
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
