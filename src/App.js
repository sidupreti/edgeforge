import React, { useState, useEffect, useCallback } from "react";
import "./index.css";
import API_BASE_URL from "./config";
import Sidebar from "./components/Sidebar";
import SetupScreen from "./components/SetupScreen";
import CollectScreen from "./components/CollectScreen";
import PipelineScreen from "./components/PipelineScreen";
import TrainScreen from "./components/TrainScreen";
import ValidateScreen from "./components/ValidateScreen";
import ExportScreen from "./components/ExportScreen";
import PlaceholderScreen from "./components/PlaceholderScreen";

const STEPS = [
  { key: "setup",    label: "Setup" },
  { key: "collect",  label: "Collect" },
  { key: "pipeline", label: "Pipeline" },
  { key: "train",    label: "Train" },
  { key: "validate", label: "Validate" },
  { key: "export",   label: "Export" },
];

const PLACEHOLDER_META = {};

const CLASS_PALETTE = [
  "#1D9E75", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899",
];

const INITIAL_CLASSES = [
  { id: "cls-idle",  name: "idle",  color: CLASS_PALETTE[1] },
  { id: "cls-event", name: "event", color: CLASS_PALETTE[0] },
];

// ── Defaults with sensible pre-selections (Issue 4) ───────────────────────────
const INITIAL_CONFIG = {
  projectName:            "",
  sensorType:             "Accelerometer (IMU)",
  connectionType:         "File Upload (CSV / WAV)",
  triggerType:            "Threshold",
  triggerConfig:          {},
  targetMcu:              "ESP32-S3",
  applicationDescription: "",
  hardwarePreprocessing:  { type: "none" },
};

const INITIAL_PIPELINE_CONFIG = {
  filter:    { cutoff: 30, order: 4, filterType: "butterworth" },
  normalize: { window: 1000, interpolation: "cubic" },
  features:  {
    mean: true, std_dev: true, rms: true, peak: true, absolute_max: true,
    fft_energy: false, dominant_freq: false, kurtosis: false,
  },
  model: "auto",
};

const INITIAL_BLOCKS = [
  { id: "filter",    type: "builtin",  name: "Filter",    skipped: false, code: null },
  { id: "normalize", type: "builtin",  name: "Normalize", skipped: false, code: null },
  { id: "features",  type: "builtin",  name: "Features",  skipped: false, code: null },
  { id: "model",     type: "builtin",  name: "Model",     skipped: false, code: null },
];

// ── localStorage helpers ──────────────────────────────────────────────────────
const STORAGE_KEY = "edgeforge_state";

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Derive a stable project_id from the project name (deterministic slug)
function slugify(name) {
  const s = (name || "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return s || "demo";
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const saved = loadSavedState();

  const [activeStep,        setActiveStep]        = useState(saved?.activeStep        ?? 0);
  const [config,            setConfig]            = useState(saved?.config            ?? INITIAL_CONFIG);
  const [classes,           setClasses]           = useState(saved?.classes           ?? INITIAL_CLASSES);
  const [activeClassId,     setActiveClassId]     = useState(saved?.activeClassId     ?? "cls-event");
  const [events,            setEvents]            = useState(saved?.events            ?? []);
  const [analyzeResult,     setAnalyzeResult]     = useState(saved?.analyzeResult     ?? null);
  const [separabilityNote,  setSeparabilityNote]  = useState(saved?.separabilityNote  ?? null);
  const [pipelineConfig,    setPipelineConfig]    = useState(saved?.pipelineConfig    ?? INITIAL_PIPELINE_CONFIG);
  const [chatHistory,       setChatHistory]       = useState(saved?.chatHistory       ?? []);
  const [aiPipelineDesign,  setAiPipelineDesign]  = useState(saved?.aiPipelineDesign  ?? null);
  const [aiConfiguredBlocks,setAiConfiguredBlocks]= useState(saved?.aiConfiguredBlocks?? {});
  const [pipelineBlocks,    setPipelineBlocks]    = useState(saved?.pipelineBlocks    ?? INITIAL_BLOCKS);
  const [pendingFlash,      setPendingFlash]      = useState(null);
  const [submitLoading,     setSubmitLoading]     = useState(false);
  const [submitError,       setSubmitError]       = useState(null);
  const [showResetConfirm,  setShowResetConfirm]  = useState(false);

  // Derived — never stored separately, always consistent with config
  const projectId = slugify(config.projectName);

  // ── Auto-save to localStorage on every state change ───────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        activeStep,
        config,
        classes,
        activeClassId,
        events,
        analyzeResult,
        separabilityNote,
        pipelineConfig,
        chatHistory,
        aiPipelineDesign,
        aiConfiguredBlocks,
        pipelineBlocks,
      }));
    } catch {
      // Ignore quota errors
    }
  }, [activeStep, config, classes, activeClassId, events, analyzeResult, separabilityNote,
      pipelineConfig, chatHistory, aiPipelineDesign, aiConfiguredBlocks, pipelineBlocks]);

  // ── Reset project ─────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setActiveStep(0);
    setConfig(INITIAL_CONFIG);
    setClasses(INITIAL_CLASSES);
    setActiveClassId("cls-event");
    setEvents([]);
    setAnalyzeResult(null);
    setSeparabilityNote(null);
    setPipelineConfig(INITIAL_PIPELINE_CONFIG);
    setChatHistory([]);
    setAiPipelineDesign(null);
    setAiConfiguredBlocks({});
    setPipelineBlocks(INITIAL_BLOCKS);
    setShowResetConfirm(false);
  }, []);

  // ── Copilot action handler ────────────────────────────────────────────────
  function handleApplyAction({ type, value }) {
    if (type === "set_cutoff") {
      setPipelineConfig((cfg) => ({ ...cfg, filter: { ...cfg.filter, cutoff: parseFloat(value) } }));
      setPendingFlash("filter");
    } else if (type === "set_window") {
      setPipelineConfig((cfg) => ({ ...cfg, normalize: { ...cfg.normalize, window: parseInt(value) } }));
      setPendingFlash("normalize");
    } else if (type === "set_model") {
      setPipelineConfig((cfg) => ({ ...cfg, model: String(value) }));
      setPendingFlash("model");
    } else if (type === "add_feature") {
      setPipelineConfig((cfg) => ({ ...cfg, features: { ...cfg.features, [String(value)]: true } }));
      setPendingFlash("features");
    }
    setActiveStep(2);
  }

  // ── Setup submit ──────────────────────────────────────────────────────────
  async function handleSetupSubmit() {
    setSubmitLoading(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/project/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:                    config.projectName || "demo",
          sensor_type:             config.sensorType,
          connection_type:         config.connectionType,
          trigger_type:            config.triggerType,
          trigger_config:          config.triggerConfig,
          target_mcu:              config.targetMcu,
          application_description: config.applicationDescription || null,
          hardware_preprocessing:  config.hardwarePreprocessing  || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `Server error ${res.status}`);
      }
      setActiveStep((s) => s + 1);
    } catch (err) {
      setSubmitError(err.message || "Request failed. Is the API running?");
    } finally {
      setSubmitLoading(false);
    }
  }

  function handleNext() {
    if (activeStep === 0) {
      handleSetupSubmit();
    } else {
      setActiveStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  }

  const goBack = () => setActiveStep((s) => Math.max(s - 1, 0));
  const currentKey = STEPS[activeStep].key;

  function renderScreen() {
    if (currentKey === "setup") {
      return (
        <SetupScreen
          config={config}
          setConfig={setConfig}
          submitError={submitError}
        />
      );
    }
    if (currentKey === "collect") {
      return (
        <CollectScreen
          config={config}
          projectId={projectId}
          classes={classes}
          setClasses={setClasses}
          activeClassId={activeClassId}
          setActiveClassId={setActiveClassId}
          events={events}
          setEvents={setEvents}
          analyzeResult={analyzeResult}
          onAnalysisReady={(data, note) => {
            setAnalyzeResult(data);
            setSeparabilityNote(note);
          }}
          chatHistory={chatHistory}
          setChatHistory={setChatHistory}
          onApplyAction={handleApplyAction}
        />
      );
    }
    if (currentKey === "pipeline") {
      return (
        <PipelineScreen
          config={config}
          analyzeResult={analyzeResult}
          separabilityNote={separabilityNote}
          pipelineConfig={pipelineConfig}
          setPipelineConfig={setPipelineConfig}
          projectId={projectId}
          chatHistory={chatHistory}
          setChatHistory={setChatHistory}
          onApplyAction={handleApplyAction}
          pendingFlash={pendingFlash}
          onFlashConsumed={() => setPendingFlash(null)}
          aiPipelineDesign={aiPipelineDesign}
          setAiPipelineDesign={setAiPipelineDesign}
          aiConfiguredBlocks={aiConfiguredBlocks}
          setAiConfiguredBlocks={setAiConfiguredBlocks}
          onGoToSetup={() => setActiveStep(0)}
          pipelineBlocks={pipelineBlocks}
          setPipelineBlocks={setPipelineBlocks}
          onNext={() => setActiveStep((s) => Math.min(s + 1, STEPS.length - 1))}
          onBack={() => setActiveStep((s) => Math.max(s - 1, 0))}
        />
      );
    }
    if (currentKey === "train") {
      return (
        <TrainScreen
          projectId={projectId}
          events={events}
          analyzeResult={analyzeResult}
          pipelineConfig={pipelineConfig}
          pipelineBlocks={pipelineBlocks}
          onRetrain={() => setActiveStep(2)}
          chatHistory={chatHistory}
          setChatHistory={setChatHistory}
          onApplyAction={handleApplyAction}
        />
      );
    }
    if (currentKey === "validate") {
      return (
        <ValidateScreen
          projectId={projectId}
          chatHistory={chatHistory}
          setChatHistory={setChatHistory}
          onApplyAction={handleApplyAction}
        />
      );
    }
    if (currentKey === "export") {
      return (
        <ExportScreen
          projectId={projectId}
          pipelineConfig={pipelineConfig}
        />
      );
    }
    const meta = PLACEHOLDER_META[currentKey];
    if (!meta) return null;
    return <PlaceholderScreen title={meta.title} description={meta.description} />;
  }

  return (
    <div className="flex h-screen bg-white text-gray-800 font-mono overflow-hidden">
      <Sidebar
        activeStep={activeStep}
        onResetRequest={() => setShowResetConfirm(true)}
      />

      {/* Reset confirmation overlay */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-6 max-w-sm w-full mx-4">
            <h2 className="text-sm font-bold text-gray-800 mb-2">Reset Project?</h2>
            <p className="text-xs text-gray-500 leading-relaxed mb-5">
              This will clear all data and start a new project. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-xs border border-gray-200 rounded text-gray-600 hover:border-gray-400 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Reset Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top bar */}
        <header className="border-b border-gray-200 px-8 py-4 flex items-center justify-between bg-white">
          <div>
            <h1 className="text-sm font-bold text-gray-800 uppercase tracking-widest">
              {STEPS[activeStep].label}
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Step {activeStep + 1} of {STEPS.length}
            </p>
          </div>

          {/* Step progress dots */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <span
                key={s.key}
                className={`
                  w-2 h-2 rounded-full
                  ${i === activeStep  ? "bg-accent" : ""}
                  ${i < activeStep   ? "bg-accent/50" : ""}
                  ${i > activeStep   ? "bg-gray-200" : ""}
                `}
              />
            ))}
          </div>
        </header>

        {/* Screen body */}
        <main className="flex-1 min-h-0 px-8 py-8 overflow-y-auto">
          {renderScreen()}
        </main>

        {/* Bottom nav bar — hidden on pipeline (PipelineScreen has its own internal nav) */}
        {currentKey !== "pipeline" && (
          <footer className="border-t border-gray-200 px-8 py-4 flex items-center justify-between bg-white">
            <button
              onClick={goBack}
              disabled={activeStep === 0}
              className={`
                px-5 py-2 rounded border text-sm tracking-wide transition-colors
                ${activeStep === 0
                  ? "border-gray-200 text-gray-300 cursor-not-allowed"
                  : "border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800"
                }
              `}
            >
              ← Back
            </button>

            <span className="text-xs text-gray-400 tracking-widest uppercase">
              {STEPS[activeStep].label}
            </span>

            <button
              onClick={handleNext}
              disabled={activeStep === STEPS.length - 1 || submitLoading}
              className={`
                px-5 py-2 rounded text-sm tracking-wide transition-colors min-w-[90px] text-center
                ${activeStep === STEPS.length - 1
                  ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                  : submitLoading
                    ? "bg-accent/60 text-white cursor-wait"
                    : "bg-accent text-white hover:bg-accent-dark"
                }
              `}
            >
              {submitLoading
                ? "Saving…"
                : activeStep === STEPS.length - 1
                  ? "Done"
                  : "Next →"}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
