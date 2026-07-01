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
          <thead><tr>
            <th className="px-2 py-1 text-gray-300 font-normal text-right w-20 text-xs">actual ↓ pred →</th>
            {classLabels.map((l) => <th key={l} className="px-2 py-1 text-gray-500 font-semibold text-center min-w-[56px]">{l}</th>)}
          </tr></thead>
          <tbody>
            {matrix.map((row, ri) => (
              <tr key={ri}>
                <td className="px-2 py-1 text-gray-500 font-semibold text-right">{classLabels[ri]}</td>
                {row.map((cell, ci) => {
                  const ok = ri === ci, int_ = cell / maxVal;
                  const bg = ok ? `rgba(29,158,117,${0.06 + int_ * 0.4})` : cell > 0 ? `rgba(239,68,68,${0.06 + int_ * 0.28})` : "transparent";
                  return <td key={ci} className="px-2 py-2 text-center font-bold tabular-nums rounded"
                    style={{ backgroundColor: bg, color: ok ? (int_ > 0.4 ? "#065f46" : "#3a3935") : cell > 0 ? "#b91c1c" : "#b0afa8" }}>{cell}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Loss Curve ───────────────────────────────────────────────────────────────

function LossCurve({ curve }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !curve?.length) return;
    const dpr = window.devicePixelRatio || 1, W = canvas.offsetWidth, H = 120;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.height = `${H}px`;
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
      <div className="flex justify-between text-[10px] text-gray-400 mt-1"><span>Epoch 1</span><span>Epoch {curve.length}</span></div>
    </div>
  );
}

// ── Score Histogram ──────────────────────────────────────────────────────────

function ScoreHistogram({ scores, title }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scores?.length) return;
    const dpr = window.devicePixelRatio || 1, W = canvas.offsetWidth, H = 140;
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
    ctx.textAlign = "center"; ctx.fillText("Distance to nearest cluster", W / 2, H - 6);
  }, [scores]);
  if (!scores?.length) return null;
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1.5">{title}</p>
      <canvas ref={canvasRef} className="w-full block rounded" style={{ height: "140px", border: "1px solid #ebeae5" }} />
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function TrainScreen({
  projectId, pipelineConfig, classes, onRetrain,
  savedClassifierResult, onClassifierResult,
  savedAnomalyResult, onAnomalyResult,
}) {
  const [blockType, setBlockType] = useState("classification");
  const [epochs, setEpochs] = useState(30);
  const [learningRate, setLR] = useState(0.0005);
  const [neurons1, setNeurons1] = useState(20);
  const [neurons2, setNeurons2] = useState(10);
  const [nClusters, setNClusters] = useState(32);
  const [training, setTraining] = useState(false);
  const [error, setError] = useState(null);

  // Persisted results — hydrate from props
  const [clfResult, setClfResult] = useState(savedClassifierResult || null);
  const [anomResult, setAnomResult] = useState(savedAnomalyResult || null);
  const result = blockType === "anomaly" ? anomResult : clfResult;

  // Normal class selection for anomaly
  const allClassNames = (classes || []).map((c) => c.name).sort();
  const [normalClasses, setNormalClasses] = useState(allClassNames);

  // Keep normalClasses in sync when classes change
  useEffect(() => {
    setNormalClasses(allClassNames);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allClassNames.join(",")]);

  function toggleNormal(cls) {
    setNormalClasses((prev) =>
      prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls].sort()
    );
  }

  async function handleTrainClassification() {
    setTraining(true); setError(null); setClfResult(null);
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
      const r = { type: "classification", ...data };
      setClfResult(r);
      onClassifierResult?.(r);
    } catch (err) { setError(err.message); }
    finally { setTraining(false); }
  }

  async function handleTrainAnomaly() {
    setTraining(true); setError(null); setAnomResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/features/anomaly/train`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId, n_clusters: nClusters,
          normal_classes: normalClasses,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server ${res.status}`);
      const r = { type: "anomaly", ...data };
      setAnomResult(r);
      onAnomalyResult?.(r);
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">
            {blockType === "anomaly" ? "Anomaly Detection" : "Neural Network Classifier"}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {blockType === "anomaly" ? "K-means distance-based novelty scoring" : `Dense(${neurons1}, relu) → Dense(${neurons2}, relu) → Softmax`}
          </p>
        </div>
        <button onClick={() => onRetrain?.()} className="px-4 py-2 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50 transition-colors">← Pipeline</button>
      </div>

      <div className="flex gap-2 mb-6">
        {[{ id: "classification", label: "Classification" }, { id: "anomaly", label: "Anomaly Detection" }].map(({ id, label }) => (
          <button key={id} onClick={() => { setBlockType(id); setError(null); }}
            className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${
              blockType === id ? "border-accent text-accent bg-accent/5" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>{label}</button>
        ))}
      </div>

      {/* Config — show when no result for current block type */}
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
            <div className="w-full max-w-lg space-y-4">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-widest block mb-1.5">Number of clusters (K)</label>
                <input type="number" min={2} max={64} value={nClusters} onChange={(e) => setNClusters(Number(e.target.value))}
                  className="w-48 border border-gray-200 rounded px-3 py-2 text-xs font-mono outline-none focus:border-accent" />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-widest block mb-2">Normal classes (train on these)</label>
                <div className="flex gap-3 flex-wrap">
                  {allClassNames.map((cls) => (
                    <label key={cls} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={normalClasses.includes(cls)}
                        onChange={() => toggleNormal(cls)} className="accent-accent w-3.5 h-3.5" />
                      <span className={`text-xs ${normalClasses.includes(cls) ? "text-gray-700 font-semibold" : "text-gray-400"}`}>{cls}</span>
                    </label>
                  ))}
                </div>
                {normalClasses.length < allClassNames.length && (
                  <p className="text-[10px] text-amber-600 mt-1.5">
                    Excluded: {allClassNames.filter((c) => !normalClasses.includes(c)).join(", ")} — these will be scored but not used to learn clusters.
                  </p>
                )}
              </div>
            </div>
          )}

          <button onClick={handleTrain} disabled={training || !projectId || (blockType === "anomaly" && normalClasses.length === 0)}
            className={`px-10 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all ${
              training || !projectId ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                : "bg-accent text-white hover:bg-accent-dark shadow-md shadow-accent/25 active:scale-95"}`}>
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
              <p className="text-4xl font-bold text-accent tabular-nums leading-none">{valAccPct}<span className="text-lg font-normal text-gray-400">%</span></p>
              <div className="w-full h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${valAccPct}%` }} /></div>
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Train Accuracy</p>
              <p className="text-4xl font-bold text-gray-700 tabular-nums leading-none">{trainAccPct}<span className="text-lg font-normal text-gray-400">%</span></p>
              <div className="w-full h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden"><div className="h-full rounded-full bg-gray-400" style={{ width: `${trainAccPct}%` }} /></div>
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
                <div><p className="text-[10px] text-gray-500 font-semibold mb-1">Train ({result.n_train})</p>
                  <div className="flex gap-2">{Object.entries(result.split_counts.train).map(([c, n]) => <span key={c} className="text-[10px] text-gray-600"><span className="font-semibold">{c}</span>: {n}</span>)}</div></div>
                <div className="border-l border-gray-200 pl-6"><p className="text-[10px] text-gray-500 font-semibold mb-1">Validation ({result.n_val})</p>
                  <div className="flex gap-2">{Object.entries(result.split_counts.val).map(([c, n]) => <span key={c} className="text-[10px] text-gray-600"><span className="font-semibold">{c}</span>: {n}</span>)}</div></div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-6">
            <div className="border border-gray-200 rounded-xl p-5"><LossCurve curve={result.loss_curve} /></div>
            <div className="border border-gray-200 rounded-xl p-5"><ConfusionMatrix matrix={result.confusion_matrix} classLabels={result.class_labels} title="Validation Confusion Matrix" /></div>
          </div>
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
          <div className="flex pb-2"><button onClick={() => { setClfResult(null); onClassifierResult?.(null); setError(null); }}
            className="px-5 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:border-gray-400 transition-colors">← Retrain</button></div>
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
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Normal Windows</p>
              <p className="text-4xl font-bold text-gray-700 tabular-nums leading-none">{result.n_train_windows}</p>
              <p className="text-xs text-gray-400 mt-2">of {result.n_total_windows} total</p>
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Trained On</p>
              <div className="flex gap-1.5 flex-wrap mt-1">
                {(result.normal_classes || []).map((c) => <span key={c} className="text-[10px] font-semibold bg-accent/10 text-accent px-1.5 py-0.5 rounded">{c}</span>)}
              </div>
              {result.excluded_classes?.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-1.5">
                  {result.excluded_classes.map((c) => <span key={c} className="text-[10px] font-semibold bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">{c} (excluded)</span>)}
                </div>
              )}
            </div>
          </div>

          {result.novelty_readout && (
            <div className="border border-accent/20 bg-accent/5 rounded-xl p-4">
              <p className="text-xs text-accent leading-relaxed">{result.novelty_readout}</p>
            </div>
          )}

          <div className="border border-gray-200 rounded-xl p-5">
            <ScoreHistogram scores={result.scores} title="Training Anomaly Score Distribution (normal-class windows)" />
          </div>

          {result.per_class_scores && (
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Per-class Anomaly Scores (all classes)</p>
              <table className="w-full text-xs"><thead><tr className="text-gray-400 uppercase tracking-widest">
                <th className="text-left pb-2">Class</th><th className="text-right pb-2">Mean</th><th className="text-right pb-2">Min</th><th className="text-right pb-2">Max</th><th className="text-right pb-2">Role</th>
              </tr></thead><tbody>
                {Object.entries(result.per_class_scores).map(([cls, s]) => (
                  <tr key={cls} className="border-t border-gray-50">
                    <td className="py-2 font-semibold text-gray-700">{cls}</td>
                    <td className="py-2 text-right tabular-nums text-gray-600">{s.mean.toFixed(3)}</td>
                    <td className="py-2 text-right tabular-nums text-gray-600">{s.min.toFixed(3)}</td>
                    <td className="py-2 text-right tabular-nums text-gray-600">{s.max.toFixed(3)}</td>
                    <td className="py-2 text-right">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${s.is_normal ? "bg-accent/10 text-accent" : "bg-amber-50 text-amber-600"}`}>
                        {s.is_normal ? "normal" : "excluded"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}

          <div className="flex pb-2"><button onClick={() => { setAnomResult(null); onAnomalyResult?.(null); setError(null); }}
            className="px-5 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:border-gray-400 transition-colors">← Retrain</button></div>
        </div>
      )}
    </div>
  );
}
