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

// Optimization presets — wired ONLY to real levers (quantization + feature count),
// not imaginary compiler dials. featureFrac trims the classifier to the top-N most
// important features (a genuine model-size lever) on the next retrain.
const PRESETS = {
  float32:  { label: "Float32",  precision: "float32", featureFrac: 1.0,  hint: "No quantization — largest, reference accuracy" },
  balanced: { label: "Balanced", precision: "int8",    featureFrac: 1.0,  hint: "INT8, all features — ~4× smaller, best accuracy/size trade" },
  smallest: { label: "Smallest", precision: "int8",    featureFrac: 0.6,  hint: "INT8 + trim to top 60% features — minimum flash" },
  fastest:  { label: "Fastest",  precision: "int8",    featureFrac: 0.75, hint: "INT8 + trim to top 75% features — fewest MACs / lowest latency" },
};

export default function TrainScreen({
  projectId, pipelineConfig, classes, featureResult, onRetrain,
  savedClassifierResult, onClassifierResult,
  savedAnomalyResult, onAnomalyResult,
  exportPrecision = "int8", setExportPrecision,
  exportPreset = "balanced", setExportPreset,
  quantResult, setQuantResult,
}) {
  const [blockType, setBlockType] = useState("classification");
  const [modelType, setModelType] = useState("mlp");  // "mlp" | "rf" | "logistic"
  const [epochs, setEpochs] = useState(30);
  const [learningRate, setLR] = useState(0.0005);
  const [neurons1, setNeurons1] = useState(20);
  const [neurons2, setNeurons2] = useState(10);
  const [nEstimators, setNEstimators] = useState(50);
  const [maxDepth, setMaxDepth] = useState(8);
  const [nClusters, setNClusters] = useState(32);
  const [anomalyAxes, setAnomalyAxes] = useState([]);  // selected feature names for anomaly
  const [suggestedN, setSuggestedN] = useState(6);
  const [allFeatures, setAllFeatures] = useState([]);  // [{name, importance}]
  const [axisFilter, setAxisFilter] = useState("");
  const [clfFeatures, setClfFeatures] = useState([]); // selected classifier feature names (empty=all)
  const [clfTrimOpen, setClfTrimOpen] = useState(false);
  const [clfFilter, setClfFilter] = useState("");
  const [training, setTraining] = useState(false);
  const [error, setError] = useState(null);
  const [quantizing, setQuantizing] = useState(false);

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
          project_id: projectId, model_type: modelType,
          epochs, learning_rate: learningRate,
          neurons_1: neurons1, neurons_2: neurons2,
          n_estimators: nEstimators, max_depth: maxDepth,
          selected_features: clfFeatures.length > 0 ? clfFeatures : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server ${res.status}`);
      const r = { type: "classification", ...data };
      setClfResult(r);
      onClassifierResult?.(r);
      setQuantResult?.(null);  // footprint is stale after a retrain
    } catch (err) { setError(err.message); }
    finally { setTraining(false); }
  }

  // INT8 quantization: measure real before/after size, latency, accuracy delta.
  async function handleQuantize() {
    setQuantizing(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/features/quantize`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server ${res.status}`);
      setQuantResult?.(data);
    } catch (err) { setError(err.message); }
    finally { setQuantizing(false); }
  }

  // Presets wire to precision + feature count (both real levers). Feature trim
  // applies on the next retrain; precision applies at export/quantize time.
  async function applyPreset(key) {
    const p = PRESETS[key];
    if (!p) return;
    setExportPreset?.(key);
    setExportPrecision?.(p.precision);
    if (p.featureFrac >= 1.0) { setClfFeatures([]); return; }
    let feats = allFeatures;
    if (feats.length === 0) {
      const data = await fetchFeatureList();
      feats = (data?.all_features || []).map((name, i) => ({ name, importance: data.all_importances?.[i] ?? 0 }));
    }
    if (feats.length > 0) {
      const sorted = feats.slice().sort((a, b) => b.importance - a.importance);
      const k = Math.max(1, Math.round(feats.length * p.featureFrac));
      setClfFeatures(sorted.slice(0, k).map((f) => f.name));
    }
  }

  async function fetchFeatureList() {
    try {
      const res = await fetch(`${API_BASE_URL}/features/anomaly/suggest-axes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, top_n: suggestedN }),
      });
      const data = await res.json();
      if (res.ok) {
        const flist = (data.all_features || []).map((name, i) => ({
          name,
          importance: data.all_importances?.[i] ?? 0,
        }));
        setAllFeatures(flist);
        return data;
      }
    } catch { /* ignore */ }
    return null;
  }

  async function handleSuggestAxes() {
    const data = await fetchFeatureList();
    if (data?.suggested) setAnomalyAxes(data.suggested);
  }

  // Load feature list when needed (anomaly or classifier trim)
  useEffect(() => {
    if (allFeatures.length === 0 && projectId && (blockType === "anomaly" || clfTrimOpen)) fetchFeatureList();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockType, projectId, clfTrimOpen]);

  async function handleTrainAnomaly() {
    setTraining(true); setError(null); setAnomResult(null);
    try {
      // Auto-suggest axes if none selected (default = top-N by importance)
      let axes = anomalyAxes;
      if (axes.length === 0) {
        try {
          const sr = await fetch(`${API_BASE_URL}/features/anomaly/suggest-axes`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project_id: projectId, top_n: suggestedN }),
          });
          const sd = await sr.json();
          if (sr.ok && sd.suggested?.length > 0) {
            axes = sd.suggested;
            setAnomalyAxes(axes);
          }
        } catch { /* proceed with all if suggest fails */ }
      }

      const res = await fetch(`${API_BASE_URL}/features/anomaly/train`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId, n_clusters: nClusters,
          normal_classes: normalClasses,
          anomaly_axes: axes,
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

  // Deployment footprint + optimization presets. showMeasure=true renders the
  // INT8 quantize action + before/after table (needs a trained model).
  function renderFootprint(showMeasure) {
    const nf = clfFeatures.length > 0
      ? clfFeatures.length
      : (featureResult?.n_features || clfResult?.n_features || allFeatures.length || 99);
    const nc = allClassNames.length || 3;
    const params = nf * neurons1 + neurons1 * neurons2 + neurons2 * nc;
    const bytesPerParam = exportPrecision === "int8" ? 1 : 4;
    const kb = (params * bytesPerParam / 1024).toFixed(1);
    const q = quantResult && quantResult.quantizable ? quantResult : null;
    const fmtB = (b) => b == null ? "—" : (b / 1024).toFixed(2) + " KB";
    const fmtP = (a) => a == null ? "—" : (a * 100).toFixed(1) + "%";
    return (
      <div className="w-full max-w-lg border border-gray-200 rounded-xl p-3 space-y-2.5" data-testid="footprint-panel">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Deployment footprint</span>
          <span className="text-[10px] text-gray-400 tabular-nums">
            est. ~{kb} KB · {exportPrecision === "int8" ? "INT8" : "float32"} · {nf}f × {neurons1}→{neurons2}→{nc}
          </span>
        </div>
        <div>
          <div className="flex gap-1.5 flex-wrap" data-testid="preset-selector">
            {Object.entries(PRESETS).map(([key, p]) => (
              <button key={key} onClick={() => applyPreset(key)} title={p.hint}
                className={`text-[10px] font-semibold rounded px-2 py-1 border transition-colors ${
                  exportPreset === key ? "border-accent text-accent bg-accent/5" : "border-gray-200 text-gray-500 hover:text-gray-700"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-gray-400 mt-1 leading-relaxed">{PRESETS[exportPreset]?.hint}</p>
        </div>
        {showMeasure && (
          <div className="pt-1 border-t border-gray-100">
            <button onClick={handleQuantize} disabled={!clfResult || quantizing}
              className="text-[10px] font-semibold text-accent border border-accent/30 rounded px-2 py-1 hover:bg-accent/5 transition-colors disabled:opacity-40">
              {quantizing ? "Quantizing…" : q ? "Re-measure INT8 footprint" : "Quantize & measure INT8"}
            </button>
            {q && (
              <table className="w-full text-[10px] mt-2 tabular-nums" data-testid="footprint-table">
                <thead><tr className="text-gray-400 uppercase tracking-wider text-[9px]">
                  <th className="text-left pb-1"></th><th className="text-right pb-1">float32</th>
                  <th className="text-right pb-1">int8</th><th className="text-right pb-1">Δ</th>
                </tr></thead>
                <tbody className="text-gray-600">
                  <tr><td className="text-gray-400">Model size</td>
                    <td className="text-right">{fmtB(q.float32.bytes)}</td>
                    <td className="text-right font-semibold text-accent">{fmtB(q.int8.bytes)}</td>
                    <td className="text-right">{q.size_reduction ? `${q.size_reduction}× smaller` : "—"}</td></tr>
                  <tr><td className="text-gray-400">Est. latency</td>
                    <td className="text-right">{q.float32.latency_ms} ms</td>
                    <td className="text-right font-semibold text-accent">{q.int8.latency_ms} ms</td>
                    <td className="text-right">{q.float32.latency_ms && q.int8.latency_ms ? `${(q.float32.latency_ms / q.int8.latency_ms).toFixed(1)}× faster` : "—"}</td></tr>
                  <tr><td className="text-gray-400">Test accuracy</td>
                    <td className="text-right">{fmtP(q.float32.accuracy)}</td>
                    <td className="text-right font-semibold text-accent">{fmtP(q.int8.accuracy)}</td>
                    <td className={`text-right ${q.accuracy_delta > 0 ? "text-emerald-600" : q.accuracy_delta < 0 ? "text-amber-600" : "text-gray-400"}`}>
                      {q.accuracy_delta == null ? "—" : `${q.accuracy_delta >= 0 ? "+" : ""}${(q.accuracy_delta * 100).toFixed(1)} pts`}</td></tr>
                </tbody>
              </table>
            )}
            {q && (
              <p className="text-[9px] text-gray-400 mt-1 leading-relaxed">
                Latency is an estimate ({q.macs?.toLocaleString()} MACs @ {(q.clock_hz / 1e6).toFixed(0)} MHz; int8 ~1 cyc/MAC vs float32 ~4).
                {q.int8?.pred_agreement != null && ` int8 agrees with float32 on ${(q.int8.pred_agreement * 100).toFixed(1)}% of test windows.`}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">
            {blockType === "anomaly" ? "Anomaly Detection"
              : modelType === "rf" ? "Random Forest Classifier"
              : modelType === "logistic" ? "Logistic Regression"
              : "Neural Network Classifier"}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {blockType === "anomaly" ? "K-means distance-based novelty scoring"
              : modelType === "rf" ? `${nEstimators} trees, max depth ${maxDepth}`
              : modelType === "logistic" ? "Multinomial logistic regression"
              : `Dense(${neurons1}, relu) → Dense(${neurons2}, relu) → Softmax`}
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
            <>
            {/* Model type selector */}
            <div className="flex gap-2 w-full max-w-lg">
              {[
                { id: "mlp", label: "Neural Network" },
                { id: "rf", label: "Random Forest" },
                { id: "logistic", label: "Logistic Regression" },
              ].map(({ id, label }) => (
                <button key={id} type="button" onClick={() => setModelType(id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    modelType === id ? "border-accent text-accent bg-accent/5" : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}>{label}</button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
              {modelType === "mlp" && (
                <>
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
                </>
              )}
              {modelType === "rf" && (
                <>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-widest block mb-1.5">Number of trees</label>
                    <input type="number" min={5} max={200} value={nEstimators} onChange={(e) => setNEstimators(Number(e.target.value))}
                      className="w-full border border-gray-200 rounded px-3 py-2 text-xs font-mono outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-widest block mb-1.5">Max depth</label>
                    <input type="number" min={2} max={20} value={maxDepth} onChange={(e) => setMaxDepth(Number(e.target.value))}
                      className="w-full border border-gray-200 rounded px-3 py-2 text-xs font-mono outline-none focus:border-accent" />
                  </div>
                </>
              )}
              {modelType === "logistic" && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 italic">Multinomial logistic regression — no hyperparameters to tune.</p>
                </div>
              )}
            </div>

            {/* Deployment footprint + presets (measurement shown in results view) */}
            {modelType === "mlp" && renderFootprint(false)}

            {/* Optional feature trimmer (collapsed by default) */}
            <div className="w-full max-w-lg">
              <button onClick={() => { setClfTrimOpen(v => !v); }}
                className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors">
                <svg className={`w-2.5 h-2.5 transition-transform ${clfTrimOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 8 8" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2 1.5l3 2.5-3 2.5" />
                </svg>
                Advanced: reduce model footprint
              </button>
              {clfTrimOpen && allFeatures.length > 0 && (
                <div className="mt-2 border border-gray-200 rounded-xl p-3 space-y-2">
                  <p className="text-[9px] text-gray-400 italic leading-relaxed">
                    The classifier normally uses all features. Trim only to reduce on-device size — this may lower accuracy.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-gray-500 tabular-nums">
                      {clfFeatures.length > 0 ? clfFeatures.length : "all " + allFeatures.length} features
                    </span>
                    <button onClick={() => {
                      const data = allFeatures.slice().sort((a,b) => b.importance - a.importance);
                      setClfFeatures(data.slice(0, Math.min(suggestedN, data.length)).map(f => f.name));
                    }} className="text-[10px] font-semibold text-accent border border-accent/30 rounded px-2 py-0.5 hover:bg-accent/5 transition-colors">
                      Top-{suggestedN}
                    </button>
                    <button onClick={() => setClfFeatures(allFeatures.map(f => f.name))}
                      className="text-[10px] text-gray-400 border border-gray-200 rounded px-2 py-0.5 hover:text-gray-600">All</button>
                    <button onClick={() => setClfFeatures([])}
                      className="text-[10px] text-gray-400 border border-gray-200 rounded px-2 py-0.5 hover:text-gray-600">Reset</button>
                    <input type="text" placeholder="Filter…" value={clfFilter} onChange={(e) => setClfFilter(e.target.value)}
                      className="text-[10px] border border-gray-200 rounded px-2 py-0.5 outline-none focus:border-accent w-24 ml-auto" />
                  </div>
                  <div className="max-h-40 overflow-y-auto border border-gray-100 rounded">
                    {(() => {
                      const filterLc = clfFilter.toLowerCase();
                      const groups = {};
                      allFeatures.forEach((f) => { const ch = f.name.split("-")[0]; if (!groups[ch]) groups[ch] = []; groups[ch].push(f); });
                      const maxImp = Math.max(...allFeatures.map(f => f.importance), 1e-9);
                      const active = clfFeatures.length > 0 ? new Set(clfFeatures) : null;
                      return Object.entries(groups).map(([ch, feats]) => {
                        const visible = feats.filter(f => !filterLc || f.name.toLowerCase().includes(filterLc));
                        if (visible.length === 0) return null;
                        const selCount = active ? visible.filter(f => active.has(f.name)).length : visible.length;
                        const allSel = selCount === visible.length;
                        const someSel = selCount > 0 && !allSel;
                        function toggleCh() {
                          if (!active) { setClfFeatures(allFeatures.filter(f => !visible.some(v => v.name === f.name)).map(f => f.name)); return; }
                          if (allSel) setClfFeatures(prev => prev.filter(n => !visible.some(f => f.name === n)));
                          else setClfFeatures(prev => [...new Set([...prev, ...visible.map(f => f.name)])]);
                        }
                        return (
                          <div key={ch}>
                            <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 sticky top-0 cursor-pointer" onClick={toggleCh}>
                              <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel; }}
                                onChange={toggleCh} className="accent-accent w-3 h-3" />
                              <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">{ch}</span>
                              <span className="text-[9px] text-gray-400 ml-auto">{selCount}/{visible.length}</span>
                            </div>
                            {visible.map((f) => (
                              <label key={f.name} className="flex items-center gap-2 px-3 py-0.5 cursor-pointer hover:bg-gray-50">
                                <input type="checkbox" checked={active ? active.has(f.name) : true}
                                  onChange={() => {
                                    if (!active) { setClfFeatures(allFeatures.filter(af => af.name !== f.name).map(af => af.name)); return; }
                                    setClfFeatures(prev => prev.includes(f.name) ? prev.filter(n => n !== f.name) : [...prev, f.name]);
                                  }}
                                  className="accent-accent w-3 h-3" />
                                <span className="text-[9px] font-mono text-gray-600 flex-1 truncate">{f.name}</span>
                                <span className="text-[9px] text-gray-300 tabular-nums w-8 text-right">{(f.importance / maxImp * 100).toFixed(0)}</span>
                              </label>
                            ))}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
            </>
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
              <div className="border border-gray-200 rounded-xl p-3">
                {/* Top bar */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <label className="text-xs text-gray-400 uppercase tracking-widest">Anomaly Axes</label>
                  <span className="text-[10px] text-gray-500 tabular-nums ml-auto">
                    {anomalyAxes.length} of {allFeatures.length} selected
                    {anomalyAxes.length > 0 && (() => {
                      const chans = [...new Set(anomalyAxes.map(n => n.split("-")[0]))];
                      return <span className="text-gray-400"> · {chans.join(", ")}</span>;
                    })()}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-gray-400">Top</span>
                    <input type="number" min={1} max={50} value={suggestedN} onChange={(e) => setSuggestedN(Number(e.target.value))}
                      className="w-10 border border-gray-200 rounded px-1 py-0.5 text-[10px] font-mono outline-none focus:border-accent text-center" />
                  </div>
                  <button onClick={handleSuggestAxes}
                    className="text-[10px] font-semibold text-accent border border-accent/30 rounded px-2 py-0.5 hover:bg-accent/5 transition-colors">
                    Auto-select top-{suggestedN}
                  </button>
                  <button onClick={() => setAnomalyAxes(allFeatures.map(f => f.name))}
                    className="text-[10px] text-gray-400 border border-gray-200 rounded px-2 py-0.5 hover:text-gray-600 transition-colors">All</button>
                  <button onClick={() => setAnomalyAxes([])}
                    className="text-[10px] text-gray-400 border border-gray-200 rounded px-2 py-0.5 hover:text-red-400 transition-colors">Clear</button>
                  <input type="text" placeholder="Filter…" value={axisFilter} onChange={(e) => setAxisFilter(e.target.value)}
                    className="text-[10px] border border-gray-200 rounded px-2 py-0.5 outline-none focus:border-accent w-28 ml-auto" />
                </div>

                {/* Grouped feature list */}
                {allFeatures.length > 0 && (() => {
                  const filterLc = axisFilter.toLowerCase();
                  const groups = {};
                  allFeatures.forEach((f) => {
                    const ch = f.name.split("-")[0];
                    if (!groups[ch]) groups[ch] = [];
                    groups[ch].push(f);
                  });
                  const maxImp = Math.max(...allFeatures.map(f => f.importance), 1e-9);

                  return (
                    <div className="max-h-48 overflow-y-auto border border-gray-100 rounded space-y-0.5">
                      {Object.entries(groups).map(([ch, feats]) => {
                        const visible = feats.filter(f => !filterLc || f.name.toLowerCase().includes(filterLc));
                        if (visible.length === 0) return null;
                        const selCount = visible.filter(f => anomalyAxes.includes(f.name)).length;
                        const allSel = selCount === visible.length;
                        const someSel = selCount > 0 && !allSel;

                        function toggleChannel() {
                          if (allSel) {
                            setAnomalyAxes(prev => prev.filter(n => !visible.some(f => f.name === n)));
                          } else {
                            setAnomalyAxes(prev => [...new Set([...prev, ...visible.map(f => f.name)])]);
                          }
                        }

                        return (
                          <div key={ch}>
                            <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 sticky top-0 cursor-pointer" onClick={toggleChannel}>
                              <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel; }}
                                onChange={toggleChannel} className="accent-accent w-3 h-3" />
                              <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">{ch}</span>
                              <span className="text-[9px] text-gray-400 ml-auto">{selCount}/{visible.length}</span>
                            </div>
                            {visible.map((f) => (
                              <label key={f.name} className="flex items-center gap-2 px-3 py-0.5 cursor-pointer hover:bg-gray-50">
                                <input type="checkbox" checked={anomalyAxes.includes(f.name)}
                                  onChange={() => setAnomalyAxes(prev =>
                                    prev.includes(f.name) ? prev.filter(n => n !== f.name) : [...prev, f.name]
                                  )}
                                  className="accent-accent w-3 h-3" />
                                <span className="text-[9px] font-mono text-gray-600 flex-1 truncate">{f.name}</span>
                                <span className="text-[9px] text-gray-300 tabular-nums w-8 text-right">{(f.importance / maxImp * 100).toFixed(0)}</span>
                              </label>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {anomalyAxes.length < 2 && allFeatures.length > 0 && (
                  <p className="text-[10px] text-amber-600 mt-1.5">Select at least 2 features to train the anomaly model.</p>
                )}
                <p className="text-[9px] text-gray-400 mt-2 italic leading-relaxed">
                  Anomaly detection learns "normal" from the selected features. To detect degradation in one signal, pick that signal's channel(s) and leave out reference channels.
                </p>
              </div>
            </div>
          )}

          <button onClick={handleTrain} disabled={training || !projectId || (blockType === "anomaly" && (normalClasses.length === 0 || (anomalyAxes.length > 0 && anomalyAxes.length < 2)))}
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
          {modelType === "mlp" && renderFootprint(true)}
          <div className="flex pb-2"><button onClick={() => { setClfResult(null); onClassifierResult?.(null); setError(null); }}
            className="px-5 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:border-gray-400 transition-colors">← Retrain</button></div>
        </div>
      )}

      {/* ── Anomaly results ─────────────────────────────────────────────── */}
      {result?.type === "anomaly" && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Clusters (K)</p>
              <p className="text-4xl font-bold text-gray-700 tabular-nums leading-none">{result.n_clusters}</p>
            </div>
            <div className="border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Axes Used</p>
              <p className="text-4xl font-bold text-gray-700 tabular-nums leading-none">{result.n_axes_used || "all"}</p>
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
