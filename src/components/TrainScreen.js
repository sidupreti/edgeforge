import React, { useState, useRef, useEffect } from "react";
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
              <th className="px-2 py-1 text-gray-300 font-normal text-right w-20 text-xs">actual ↓ pred →</th>
              {classLabels.map((l) => (
                <th key={l} className="px-2 py-1 text-gray-500 font-semibold text-center min-w-[56px]">{l}</th>
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
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !curve?.length) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = 120;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
    ctx.fillStyle = "#fbfaf6"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(10,10,10,0.06)"; ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) { const y = Math.round((g / 4) * H) + 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const maxL = Math.max(...curve), minL = Math.min(...curve), range = Math.max(maxL - minL, 1e-6);
    ctx.beginPath();
    curve.forEach((v, i) => { const x = (i / Math.max(curve.length - 1, 1)) * W; const y = H - 8 - ((v - minL) / range) * (H - 16); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.strokeStyle = "#F59E0B"; ctx.lineWidth = 2; ctx.stroke();
  }, [curve]);
  if (!curve?.length) return null;
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1.5">Training Loss</p>
      <canvas ref={canvasRef} className="w-full block rounded" style={{ height: "120px", border: "1px solid #ebeae5" }} />
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>Epoch 1</span><span>Epoch {curve.length}</span>
      </div>
    </div>
  );
}

// ── Score Distribution Histogram (anomaly) ───────────────────────────────────

function ScoreHistogram({ scores, threshold, title = "Anomaly Score Distribution" }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scores?.length) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = 140;
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
      const binCenter = min + (i + 0.5) * binW;
      ctx.fillStyle = binCenter > threshold ? "rgba(239,68,68,0.5)" : "rgba(29,158,117,0.4)";
      ctx.fillRect(x, H - 20 - h, barW - 1, h);
    });

    // Threshold line
    const tx = 30 + ((threshold - min) / range) * (W - 40);
    ctx.beginPath(); ctx.moveTo(tx, 4); ctx.lineTo(tx, H - 20);
    ctx.strokeStyle = "#EF4444"; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#EF4444"; ctx.font = "9px system-ui"; ctx.textAlign = "center";
    ctx.fillText(`threshold: ${threshold.toFixed(2)}`, tx, H - 6);
  }, [scores, threshold]);

  if (!scores?.length) return null;
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1.5">{title}</p>
      <canvas ref={canvasRef} className="w-full block rounded" style={{ height: "140px", border: "1px solid #ebeae5" }} />
      <div className="flex gap-3 mt-1">
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <span className="w-2.5 h-2 rounded-sm" style={{ background: "rgba(29,158,117,0.4)" }} /> Normal
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <span className="w-2.5 h-2 rounded-sm" style={{ background: "rgba(239,68,68,0.5)" }} /> Anomalous
        </span>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function TrainScreen({ projectId, pipelineConfig, onRetrain }) {
  // Learning block type
  const [blockType, setBlockType] = useState("classification"); // "classification" | "anomaly"

  // Classification config
  const [epochs, setEpochs]       = useState(30);
  const [learningRate, setLR]     = useState(0.0005);
  const [neurons1, setNeurons1]   = useState(20);
  const [neurons2, setNeurons2]   = useState(10);

  // Anomaly config
  const [nClusters, setNClusters]     = useState(32);
  const [threshPctile, setThreshPctile] = useState(95);

  // Shared state
  const [training, setTraining] = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);

  async function handleTrainClassification() {
    setTraining(true); setError(null); setResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/features/train`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId, epochs, learning_rate: learningRate,
          neurons_1: neurons1, neurons_2: neurons2,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server ${res.status}`);
      setResult({ type: "classification", ...data });
    } catch (err) { setError(err.message); }
    finally { setTraining(false); }
  }

  async function handleTrainAnomaly() {
    setTraining(true); setError(null); setResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/features/anomaly/train`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId, n_clusters: nClusters,
          threshold_pctile: threshPctile,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server ${res.status}`);
      setResult({ type: "anomaly", ...data });
    } catch (err) { setError(err.message); }
    finally { setTraining(false); }
  }

  function handleTrain() {
    if (blockType === "anomaly") handleTrainAnomaly();
    else handleTrainClassification();
  }

  const valAccPct = result?.val_accuracy != null ? Math.round(result.val_accuracy * 100) : null;
  const trainAccPct = result?.train_accuracy != null ? Math.round(result.train_accuracy * 100) : null;

  return (
    <div className="flex flex-col min-h-0 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">
            {blockType === "anomaly" ? "Anomaly Detection" : "Neural Network Classifier"}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {blockType === "anomaly"
              ? "K-means distance-based novelty detection"
              : `Dense(${neurons1}, relu) → Dense(${neurons2}, relu) → Softmax`}
          </p>
        </div>
        <button onClick={() => onRetrain?.()} className="px-4 py-2 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50 transition-colors">
          ← Pipeline
        </button>
      </div>

      {/* Learning block type toggle */}
      <div className="flex gap-2 mb-6">
        {[
          { id: "classification", label: "Classification" },
          { id: "anomaly", label: "Anomaly Detection" },
        ].map(({ id, label }) => (
          <button key={id}
            onClick={() => { setBlockType(id); setResult(null); setError(null); }}
            className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${
              blockType === id ? "border-accent text-accent bg-accent/5" : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Config */}
      {!result && (
        <div className="flex flex-col items-center gap-6 py-4">
          {blockType === "classification" ? (
            <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-widest block mb-1.5">Training cycles</label>
                <input type="number" min={5} max={500} value={epochs} onChange={(e) => setEpochs(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-xs font-mono outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-widest block mb-1.5">Learning rate</label>
                <input type="number" min={0.00001} max={0.1} step={0.0001} value={learningRate} onChange={(e) => setLR(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-xs font-mono outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-widest block mb-1.5">Dense layer 1 neurons</label>
                <input type="number" min={1} max={256} value={neurons1} onChange={(e) => setNeurons1(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-xs font-mono outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-widest block mb-1.5">Dense layer 2 neurons</label>
                <input type="number" min={1} max={256} value={neurons2} onChange={(e) => setNeurons2(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-xs font-mono outline-none focus:border-accent" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-widest block mb-1.5">Number of clusters (K)</label>
                <input type="number" min={2} max={64} value={nClusters} onChange={(e) => setNClusters(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-xs font-mono outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-widest block mb-1.5">Anomaly threshold percentile</label>
                <input type="number" min={50} max={99.9} step={0.5} value={threshPctile} onChange={(e) => setThreshPctile(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-xs font-mono outline-none focus:border-accent" />
              </div>
            </div>
          )}

          <button onClick={handleTrain} disabled={training || !projectId}
            className={`px-10 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all ${
              training || !projectId
                ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                : "bg-accent text-white hover:bg-accent-dark shadow-md shadow-accent/25 active:scale-95"
            }`}>
            {training ? "Training…" : blockType === "anomaly" ? "Train Anomaly Model" : "Start Training"}
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}

      {/* ── Classification results ──────────────────────────────────────── */}
      {result?.type === "classification" && (
        <div className="space-y-6">
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
              <p className="text-4xl font-bold text-gray-700 tabular-nums leading-none">{result.epochs_run}</p>
              <p className="text-xs text-gray-400 mt-2">{result.n_train} train · {result.n_val} val</p>
            </div>
          </div>

          {result.split_counts && (
            <div className="border border-gray-200 rounded-xl p-4">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">Train / Validation Split</p>
              <div className="flex gap-6">
                <div>
                  <p className="text-[10px] text-gray-500 font-semibold mb-1">Train ({result.n_train})</p>
                  <div className="flex gap-2">
                    {Object.entries(result.split_counts.train).map(([cls, count]) => (
                      <span key={cls} className="text-[10px] text-gray-600"><span className="font-semibold">{cls}</span>: {count}</span>
                    ))}
                  </div>
                </div>
                <div className="border-l border-gray-200 pl-6">
                  <p className="text-[10px] text-gray-500 font-semibold mb-1">Validation ({result.n_val})</p>
                  <div className="flex gap-2">
                    {Object.entries(result.split_counts.val).map(([cls, count]) => (
                      <span key={cls} className="text-[10px] text-gray-600"><span className="font-semibold">{cls}</span>: {count}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            <div className="border border-gray-200 rounded-xl p-5">
              <LossCurve curve={result.loss_curve} />
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <ConfusionMatrix matrix={result.confusion_matrix} classLabels={result.class_labels} title="Validation Confusion Matrix" />
            </div>
          </div>

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

          <div className="flex justify-between pb-2">
            <button onClick={() => { setResult(null); setError(null); }}
              className="px-5 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:border-gray-400 transition-colors">
              ← Retrain
            </button>
          </div>
        </div>
      )}

      {/* ── Anomaly results ─────────────────────────────────────────────── */}
      {result?.type === "anomaly" && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Clusters (K)</p>
              <p className="text-4xl font-bold text-gray-700 tabular-nums leading-none">{result.n_clusters}</p>
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Threshold</p>
              <p className="text-4xl font-bold text-accent tabular-nums leading-none">{result.threshold?.toFixed(2)}</p>
              <p className="text-xs text-gray-400 mt-2">p{result.threshold_pctile} of training distances</p>
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Flagged (train)</p>
              <p className="text-4xl font-bold text-amber-500 tabular-nums leading-none">{result.n_flagged}</p>
              <p className="text-xs text-gray-400 mt-2">of {result.n_train_windows} windows</p>
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl p-5">
            <ScoreHistogram scores={result.scores} threshold={result.threshold} title="Training Anomaly Score Distribution" />
          </div>

          {result.per_class_scores && (
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Per-class Mean Anomaly Score</p>
              <div className="space-y-2">
                {Object.entries(result.per_class_scores).map(([cls, score]) => (
                  <div key={cls} className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-gray-700 w-20">{cls}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (score / result.threshold) * 100)}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 tabular-nums w-14 text-right">{score.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between pb-2">
            <button onClick={() => { setResult(null); setError(null); }}
              className="px-5 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:border-gray-400 transition-colors">
              ← Retrain
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
