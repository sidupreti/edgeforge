import React, { useState } from "react";
import API_BASE_URL from "../config";

// ── Confusion Matrix ─────────────────────────────────────────────────────────

function ConfusionMatrix({ matrix, classLabels, title = "Confusion Matrix" }) {
  if (!matrix || !classLabels || classLabels.length === 0) return null;
  const maxVal = Math.max(...matrix.flat().filter((v) => isFinite(v)), 1);

  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">{title}</p>
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="px-2 py-1 text-gray-300 font-normal text-right w-20 text-xs">
                actual ↓ pred →
              </th>
              {classLabels.map((label) => (
                <th key={label} className="px-2 py-1 text-gray-500 font-semibold text-center min-w-[56px]">
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Loss Curve Canvas ────────────────────────────────────────────────────────

function LossCurve({ curve }) {
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !curve?.length) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = 120;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#fbfaf6";
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(10,10,10,0.06)";
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const y = Math.round((g / 4) * H) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const maxL = Math.max(...curve);
    const minL = Math.min(...curve);
    const range = Math.max(maxL - minL, 1e-6);

    ctx.beginPath();
    curve.forEach((v, i) => {
      const x = (i / Math.max(curve.length - 1, 1)) * W;
      const y = H - 8 - ((v - minL) / range) * (H - 16);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [curve]);

  if (!curve?.length) return null;
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1.5">Training Loss</p>
      <canvas ref={canvasRef} className="w-full block rounded" style={{ height: "120px", border: "1px solid #ebeae5" }} />
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>Epoch 1</span>
        <span>Epoch {curve.length}</span>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function TrainScreen({ projectId, pipelineConfig, onRetrain }) {
  const [epochs, setEpochs]         = useState(30);
  const [learningRate, setLR]       = useState(0.0005);
  const [training, setTraining]     = useState(false);
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState(null);

  async function handleTrain() {
    setTraining(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/features/train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id:    projectId,
          epochs:        epochs,
          learning_rate: learningRate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server ${res.status}`);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setTraining(false);
    }
  }

  const valAccPct = result ? Math.round(result.val_accuracy * 100) : null;
  const trainAccPct = result ? Math.round(result.train_accuracy * 100) : null;

  return (
    <div className="flex flex-col min-h-0 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Neural Network Classifier</h2>
          <p className="text-xs text-gray-400 mt-1">Dense(20, relu) → Dense(10, relu) → Softmax</p>
        </div>
        <button
          onClick={() => onRetrain?.()}
          className="px-4 py-2 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
        >
          ← Pipeline
        </button>
      </div>

      {/* Config + Train */}
      {!result && (
        <div className="flex flex-col items-center gap-6 py-6">
          <div className="grid grid-cols-2 gap-6 w-full max-w-md">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-widest block mb-1.5">Training cycles</label>
              <input
                type="number" min={5} max={500} value={epochs}
                onChange={(e) => setEpochs(Number(e.target.value))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-xs font-mono outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-widest block mb-1.5">Learning rate</label>
              <input
                type="number" min={0.00001} max={0.1} step={0.0001} value={learningRate}
                onChange={(e) => setLR(Number(e.target.value))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-xs font-mono outline-none focus:border-accent"
              />
            </div>
          </div>

          <button
            onClick={handleTrain}
            disabled={training || !projectId}
            className={`px-10 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all ${
              training || !projectId
                ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                : "bg-accent text-white hover:bg-accent-dark shadow-md shadow-accent/25 active:scale-95"
            }`}
          >
            {training ? "Training…" : "Start Training"}
          </button>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Accuracy + Loss tiles */}
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Validation Accuracy</p>
              <p className="text-4xl font-bold text-accent tabular-nums leading-none">
                {valAccPct}<span className="text-lg font-normal text-gray-400">%</span>
              </p>
              <div className="w-full h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
                <div className="h-full rounded-full bg-accent" style={{ width: `${valAccPct}%` }} />
              </div>
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Train Accuracy</p>
              <p className="text-4xl font-bold text-gray-700 tabular-nums leading-none">
                {trainAccPct}<span className="text-lg font-normal text-gray-400">%</span>
              </p>
              <div className="w-full h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
                <div className="h-full rounded-full bg-gray-400" style={{ width: `${trainAccPct}%` }} />
              </div>
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Epochs</p>
              <p className="text-4xl font-bold text-gray-700 tabular-nums leading-none">
                {result.epochs_run}
              </p>
              <p className="text-xs text-gray-400 mt-2">
                {result.n_train} train · {result.n_val} val windows
              </p>
            </div>
          </div>

          {/* Loss curve + confusion */}
          <div className="grid grid-cols-2 gap-6">
            <div className="border border-gray-200 rounded-xl p-5">
              <LossCurve curve={result.loss_curve} />
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <ConfusionMatrix
                matrix={result.confusion_matrix}
                classLabels={result.class_labels}
                title="Validation Confusion Matrix"
              />
            </div>
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

          {/* Retrain */}
          <div className="flex justify-between pb-2">
            <button
              onClick={() => { setResult(null); setError(null); }}
              className="px-5 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:border-gray-400 transition-colors"
            >
              ← Retrain
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
