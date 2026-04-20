import React, { useState, useEffect, useRef } from "react";
import API_BASE_URL from "../config";
import CopilotChat from "./CopilotChat";

const MODEL_LABELS = { auto: "Auto-select", rf: "Random Forest", svm: "SVM", nn: "Neural Net" };

// ── Pipeline config summary bar ───────────────────────────────────────────────

function ConfigSummary({ pipelineConfig }) {
  const selectedCount = Object.values(pipelineConfig.features).filter(Boolean).length;
  const modelLabel    = MODEL_LABELS[pipelineConfig.model] ?? pipelineConfig.model;

  const items = [
    { label: "Cutoff",    value: `${pipelineConfig.filter.cutoff} Hz` },
    { label: "Order",     value: `${pipelineConfig.filter.order}` },
    { label: "Window",    value: `${pipelineConfig.normalize.window} ms` },
    { label: "Interp",    value: pipelineConfig.normalize.interpolation },
    { label: "Features",  value: `${selectedCount} selected` },
    { label: "Model",     value: modelLabel },
  ];

  return (
    <div className="flex items-center gap-0 border border-gray-200 rounded-lg overflow-hidden mb-8 flex-shrink-0">
      {items.map(({ label, value }, i) => (
        <div
          key={label}
          className={`flex-1 px-4 py-3 ${i < items.length - 1 ? "border-r border-gray-200" : ""}`}
        >
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">{label}</p>
          <p className="text-xs font-bold text-gray-700 truncate">{value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Model step indicators (shown while training) ──────────────────────────────

function ModelStepRow({ name, status }) {
  // status: "waiting" | "training" | "done"
  return (
    <div className="flex items-center gap-3 py-2">
      <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
        status === "done"
          ? "border-accent bg-accent"
          : status === "training"
          ? "border-accent bg-transparent animate-pulse"
          : "border-gray-200 bg-transparent"
      }`}>
        {status === "done" && (
          <svg viewBox="0 0 10 8" className="w-2.5 h-2 fill-none stroke-white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4l3 3 5-6" />
          </svg>
        )}
        {status === "training" && (
          <div className="w-1.5 h-1.5 rounded-full bg-accent" />
        )}
      </div>
      <span className={`text-sm transition-colors ${
        status === "done"
          ? "text-gray-700"
          : status === "training"
          ? "text-accent font-semibold"
          : "text-gray-300"
      }`}>
        {name}
      </span>
      {status === "training" && (
        <div className="flex gap-1 ml-auto">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1 h-1 rounded-full bg-accent/60 animate-bounce"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      )}
      {status === "done" && (
        <span className="ml-auto text-xs text-gray-300">done</span>
      )}
    </div>
  );
}

// ── Confusion matrix ──────────────────────────────────────────────────────────

function ConfusionMatrix({ matrix, classLabels }) {
  if (!matrix || !classLabels || classLabels.length === 0) return null;

  const maxVal = Math.max(...matrix.flat().filter((v) => isFinite(v)), 1);

  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Confusion Matrix</p>
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
                    ? `rgba(29,158,117,${0.12 + intensity * 0.55})`
                    : cell > 0
                    ? `rgba(239,68,68,${0.08 + intensity * 0.35})`
                    : "transparent";
                  return (
                    <td
                      key={ci}
                      className="px-2 py-2 text-center font-bold tabular-nums rounded"
                      style={{
                        backgroundColor: bg,
                        color: isCorrect ? (intensity > 0.4 ? "#0f5c42" : "#1D9E75") : cell > 0 ? "#b91c1c" : "#9ca3af",
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

// ── Model result card ─────────────────────────────────────────────────────────

function ModelCard({ result, isBest }) {
  const accuracyPct = Math.round((result.accuracy ?? result.cv_accuracy ?? 0) * 100);
  const cvPct       = Math.round((result.cv_accuracy ?? 0) * 100);

  return (
    <div
      className={`relative rounded-xl border-2 p-5 flex flex-col gap-3 transition-all ${
        isBest
          ? "border-accent shadow-sm shadow-accent/20"
          : "border-gray-200"
      }`}
      style={isBest ? { backgroundColor: "rgba(29,158,117,0.04)" } : {}}
    >
      {isBest && (
        <div className="absolute -top-3 left-4">
          <span className="text-xs bg-accent text-white font-bold px-2.5 py-0.5 rounded-full tracking-wide uppercase shadow-sm">
            Best
          </span>
        </div>
      )}

      <div>
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">{result.name}</p>
        <p
          className={`text-4xl font-bold tabular-nums leading-none ${
            isBest ? "text-accent" : "text-gray-700"
          }`}
        >
          {accuracyPct}
          <span className="text-lg font-normal text-gray-400">%</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">train accuracy</p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">CV accuracy</span>
          <span className="font-semibold text-gray-600 tabular-nums">{cvPct}%</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Training time</span>
          <span className="font-semibold text-gray-600 tabular-nums">
            {result.training_time_s != null ? `${result.training_time_s.toFixed(2)} s` : "—"}
          </span>
        </div>
      </div>

      {/* Accuracy bar */}
      <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${isBest ? "bg-accent" : "bg-gray-300"}`}
          style={{ width: `${accuracyPct}%` }}
        />
      </div>
    </div>
  );
}

// ── Copilot explanation ───────────────────────────────────────────────────────

function CopilotExplanation({ results, analyzeResult, chatHistory, setChatHistory, projectId, onApplyAction, pipelineConfig }) {
  const best       = results?.models?.find((m) => m.id === results.best_model_id);
  const others     = results?.models?.filter((m) => m.id !== results.best_model_id) ?? [];
  const bestAcc    = Math.round((best?.accuracy ?? 0) * 100);
  const bestCvAcc  = Math.round((best?.cv_accuracy ?? 0) * 100);
  const gap        = bestAcc - bestCvAcc;

  // Find hardest class from confusion matrix (most off-diagonal errors)
  let hardestClass = null;
  if (results?.confusion_matrix && results?.class_labels) {
    const errors = results.class_labels.map((label, ri) => {
      const row   = results.confusion_matrix[ri];
      const total = row.reduce((a, b) => a + b, 0);
      const wrong = total - (row[ri] ?? 0);
      return { label, wrong, total };
    });
    const worst = errors.sort((a, b) => b.wrong / Math.max(b.total, 1) - a.wrong / Math.max(a.total, 1))[0];
    if (worst && worst.wrong > 0) hardestClass = worst;
  }

  const totalEvents = analyzeResult?.event_count ?? 0;
  const moreDataHelps = bestCvAcc < 85;

  const lines = [];

  if (best) {
    const runner = others.sort((a, b) => (b.cv_accuracy ?? 0) - (a.cv_accuracy ?? 0))[0];
    if (runner) {
      const diff = Math.round(((best.cv_accuracy ?? 0) - (runner.cv_accuracy ?? 0)) * 100);
      lines.push(
        diff > 2
          ? `${best.name} outperformed ${runner.name} by ${diff} pp on cross-validation — likely because it handles feature interactions without overfitting on small datasets.`
          : `${best.name} edged out ${runner.name} by ${diff} pp on CV. Both are viable — ${best.name} was selected for consistency.`
      );
    } else {
      lines.push(`${best.name} achieved ${bestCvAcc}% cross-validated accuracy.`);
    }
  }

  if (gap > 8) {
    lines.push(`Train accuracy (${bestAcc}%) is ${gap} pp above CV accuracy — a sign of mild overfitting. Collecting more samples per class will help generalize.`);
  } else if (gap <= 3) {
    lines.push(`Train and CV accuracy are within ${gap} pp — the model generalizes well on the current dataset.`);
  }

  if (hardestClass) {
    const errRate = Math.round((hardestClass.wrong / Math.max(hardestClass.total, 1)) * 100);
    lines.push(`"${hardestClass.label}" has the highest misclassification rate (${errRate}% of samples). Consider collecting more examples or adding discriminating features.`);
  }

  if (moreDataHelps) {
    lines.push(`With ${totalEvents} events, more data would likely push accuracy above 85%. Aim for 30+ samples per class for reliable embedded deployment.`);
  } else {
    lines.push(`${totalEvents} events provided a solid training base. The model should transfer well to on-device inference.`);
  }

  return (
    <div className="border border-gray-200 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="w-3.5 h-3.5 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        </div>
        <h3 className="text-xs uppercase tracking-widest text-gray-500">Copilot Analysis</h3>
      </div>
      <div className="space-y-3">
        {lines.map((line, i) => (
          <p key={i} className="text-sm text-gray-600 leading-relaxed">
            {line}
          </p>
        ))}
      </div>
      <div className="border-t border-gray-100 pt-3">
        <CopilotChat
          chatHistory={chatHistory}
          setChatHistory={setChatHistory}
          projectId={projectId}
          onApplyAction={onApplyAction}
          screen="train"
          pipelineConfig={pipelineConfig}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const MODEL_TRAIN_STEPS = [
  { id: "rf",   label: "Random Forest" },
  { id: "svm",  label: "SVM" },
  { id: "nn",   label: "Neural Net" },
];

export default function TrainScreen({ projectId, events, analyzeResult, pipelineConfig, pipelineBlocks, onRetrain, chatHistory, setChatHistory, onApplyAction }) {
  const [trainState,    setTrainState]    = useState("idle"); // idle | running | done | error
  const [progress,      setProgress]      = useState(0);
  const [currentModel,  setCurrentModel]  = useState("");
  const [results,       setResults]       = useState(null);
  const [trainError,    setTrainError]    = useState(null);
  const pollRef = useRef(null);

  // projectId is always provided and derived from the project name in App.js
  const effectiveProjectId = projectId ?? "demo";

  // Track which models have started/finished based on currentModel string from backend
  function getModelStatus(modelId) {
    if (!currentModel) return "waiting";
    const order = ["rf", "svm", "nn"];
    const currentIdx = order.findIndex((id) => currentModel.toLowerCase().includes(
      id === "rf" ? "forest" : id === "svm" ? "svm" : "neural"
    ));
    const thisIdx = order.indexOf(modelId);
    if (currentIdx === -1) return trainState === "done" ? "done" : "waiting";
    if (thisIdx < currentIdx) return "done";
    if (thisIdx === currentIdx) return "training";
    return "waiting";
  }

  useEffect(() => {
    return () => clearInterval(pollRef.current);
  }, []);

  async function pollStatus() {
    try {
      const res  = await fetch(`${API_BASE_URL}/train/status`);
      if (!res.ok) return;
      const data = await res.json();
      setProgress(data.progress ?? 0);
      setCurrentModel(data.current_model ?? "");
      if (data.state === "done") {
        clearInterval(pollRef.current);
        setResults(data.results);
        setTrainState("done");
      } else if (data.state === "error") {
        clearInterval(pollRef.current);
        setTrainError(data.error ?? "Training failed.");
        setTrainState("error");
      }
    } catch {
      // silently ignore transient network errors during polling
    }
  }

  async function startTraining() {
    setTrainState("running");
    setProgress(0);
    setCurrentModel("");
    setResults(null);
    setTrainError(null);

    const selectedFeatures = Object.entries(pipelineConfig.features)
      .filter(([, v]) => v)
      .map(([k]) => k);

    // Build event payload as fallback in case backend lost in-memory state
    const eventPayload = (events || [])
      .filter(ev => ev.snapshot?.ax?.length > 0 || ev.snapshot?.az?.length > 0)
      .map(ev => ({
        ax:          ev.snapshot?.ax ?? [],
        ay:          ev.snapshot?.ay ?? [],
        az:          ev.snapshot?.az ?? ev.waveform ?? [],
        duration_ms: ev.duration ?? 0,
        class_label: ev.className ?? "unknown",
      }));

    try {
      const res = await fetch(`${API_BASE_URL}/train`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          project_id:        effectiveProjectId,
          cutoff_hz:         pipelineConfig.filter.cutoff,
          filter_type:       pipelineConfig.filter.filterType ?? "butterworth",
          window_ms:         pipelineConfig.normalize.window,
          interpolation:     pipelineConfig.normalize.interpolation,
          selected_features: selectedFeatures,
          model_type:        pipelineConfig.model,
          custom_blocks:     (pipelineBlocks || [])
            .filter(b => !b.skipped && (b.type === "custom" || b.type === "standard") && b.code)
            .map(b => ({ id: b.id, name: b.name, code: b.code })),
          events:            eventPayload.length > 0 ? eventPayload : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `Server error ${res.status}`);
      }
      pollRef.current = setInterval(pollStatus, 500);
    } catch (err) {
      setTrainState("error");
      setTrainError(err.message ?? "Request failed. Is the API running?");
    }
  }

  function handleRetrain() {
    clearInterval(pollRef.current);
    setTrainState("idle");
    setProgress(0);
    setCurrentModel("");
    setResults(null);
    setTrainError(null);
    onRetrain?.();
  }

  const canTrain = Boolean(effectiveProjectId) && Boolean(analyzeResult);
  const bestModel = results?.models?.find((m) => m.id === results.best_model_id);

  // ── Determine which model steps to show while running ──
  const modelStepsToShow = pipelineConfig.model === "auto"
    ? MODEL_TRAIN_STEPS
    : MODEL_TRAIN_STEPS.filter((s) => s.id === pipelineConfig.model);

  return (
    <div className="flex flex-col min-h-0 max-w-4xl mx-auto w-full">

      {/* Pipeline config summary */}
      <ConfigSummary pipelineConfig={pipelineConfig} />

      {/* ── IDLE ─────────────────────────────────────────────────────────── */}
      {trainState === "idle" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 py-8">
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-800 mb-2">Ready to train</h2>
            <p className="text-sm text-gray-400 max-w-sm leading-relaxed">
              {!effectiveProjectId
                ? "Creating demo project…"
                : !analyzeResult
                ? "Complete data collection and signal analysis before training."
                : "Pipeline configured. Click Run Training to benchmark classifiers and select the best model."}
            </p>
          </div>

          {/* Guards: missing project or events */}
          {(!effectiveProjectId || !analyzeResult) && (
            <div className="flex flex-col gap-2 w-full max-w-xs">
              {[
                {
                  met:  Boolean(effectiveProjectId),
                  text: effectiveProjectId && !projectId ? "Project created (demo)" : "Project created",
                },
                { met: Boolean(analyzeResult), text: "Signal analysis complete" },
              ].map(({ met, text }) => (
                <div key={text} className="flex items-center gap-2.5 text-sm">
                  <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${met ? "border-accent bg-accent" : "border-gray-200"}`}>
                    {met && (
                      <svg viewBox="0 0 10 8" className="w-2.5 h-2 fill-none stroke-white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 4l3 3 5-6" />
                      </svg>
                    )}
                  </span>
                  <span className={met ? "text-gray-600" : "text-gray-300"}>{text}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={startTraining}
            disabled={!canTrain}
            className={`px-10 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all ${
              canTrain
                ? "bg-accent text-white hover:bg-accent-dark shadow-md shadow-accent/25 hover:shadow-lg hover:shadow-accent/30 active:scale-95"
                : "bg-gray-100 text-gray-300 cursor-not-allowed"
            }`}
          >
            Run Training →
          </button>

          {/* Copilot chat — available before training starts */}
          <div className="w-full max-w-sm border border-gray-200 rounded-xl p-4">
            <CopilotChat
              chatHistory={chatHistory}
              setChatHistory={setChatHistory}
              projectId={effectiveProjectId}
              onApplyAction={onApplyAction}
              screen="train"
              pipelineConfig={pipelineConfig}
            />
          </div>
        </div>
      )}

      {/* ── RUNNING ──────────────────────────────────────────────────────── */}
      {trainState === "running" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 py-8">
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-800 mb-1">Training in progress</h2>
            <p className="text-sm text-gray-400">
              {currentModel ? `Currently training: ${currentModel}` : "Preprocessing events…"}
            </p>
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-md">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
              <span>Progress</span>
              <span className="tabular-nums font-semibold text-gray-600">{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Model step indicators */}
          <div className="w-full max-w-md border border-gray-200 rounded-xl p-5 divide-y divide-gray-100">
            {modelStepsToShow.map((step) => (
              <ModelStepRow
                key={step.id}
                name={step.label}
                status={getModelStatus(step.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── DONE ─────────────────────────────────────────────────────────── */}
      {trainState === "done" && results && (
        <div className="flex flex-col gap-6">

          {/* Model cards */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Results</p>
            <div className={`grid gap-4 ${results.models.length === 1 ? "grid-cols-1 max-w-xs" : results.models.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
              {results.models
                .slice()
                .sort((a, b) => (b.cv_accuracy ?? 0) - (a.cv_accuracy ?? 0))
                .map((m) => (
                  <ModelCard key={m.id} result={m} isBest={m.id === results.best_model_id} />
                ))}
            </div>
          </div>

          {/* Confusion matrix + copilot side-by-side */}
          <div className="grid grid-cols-2 gap-6">
            <div className="border border-gray-200 rounded-xl p-5">
              <ConfusionMatrix
                matrix={results.confusion_matrix}
                classLabels={results.class_labels}
              />
              {bestModel && (
                <p className="text-xs text-gray-400 mt-4">
                  Best model: <span className="font-semibold text-gray-600">{bestModel.name}</span>
                </p>
              )}
            </div>

            <CopilotExplanation
              results={results}
              analyzeResult={analyzeResult}
              chatHistory={chatHistory}
              setChatHistory={setChatHistory}
              projectId={effectiveProjectId}
              onApplyAction={onApplyAction}
              pipelineConfig={pipelineConfig}
            />
          </div>

          {/* Retrain button */}
          <div className="flex justify-end pb-2">
            <button
              onClick={handleRetrain}
              className="px-5 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors tracking-wide"
            >
              ← Retrain
            </button>
          </div>
        </div>
      )}

      {/* ── ERROR ────────────────────────────────────────────────────────── */}
      {trainState === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 py-8">
          <div className="w-12 h-12 rounded-full border-2 border-red-200 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700 mb-1">Training failed</p>
            <p className="text-xs text-red-500 max-w-sm leading-relaxed">{trainError}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleRetrain}
              className="px-5 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:border-gray-400 transition-colors"
            >
              ← Adjust pipeline
            </button>
            <button
              onClick={startTraining}
              disabled={!canTrain}
              className="px-5 py-2 rounded bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
