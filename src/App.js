import React, { useState, useEffect, useCallback } from "react";
import { Routes, Route } from "react-router-dom";
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
import RecordingsScreen from "./components/RecordingsScreen";
import FlowFieldBackground from "./components/FlowFieldBackground";
import NewOnboarding from "./components/NewOnboarding";
import LandingPage from "./components/LandingPage";
import ContactPage from "./components/ContactPage";

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
const STORAGE_KEY = "sensorflow_state";

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

// ── Router shell ─────────────────────────────────────────────────────────────
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/app/*" element={<AppContent />} />
      {/* Catch-all: redirect unknown paths to landing */}
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}

// ── App content (existing tool — unchanged in behavior) ───────────────────────
function AppContent() {
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
  const [trainResults,      setTrainResults]      = useState(saved?.trainResults      ?? null);
  const [pendingFlash,      setPendingFlash]      = useState(null);
  const [submitLoading,     setSubmitLoading]     = useState(false);
  const [submitError,       setSubmitError]       = useState(null);
  const [showResetConfirm,  setShowResetConfirm]  = useState(false);
  const [showRecordings,    setShowRecordings]    = useState(false);

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
        trainResults,
      }));
    } catch {
      // Ignore quota errors
    }
  }, [activeStep, config, classes, activeClassId, events, analyzeResult, separabilityNote,
      pipelineConfig, chatHistory, aiPipelineDesign, aiConfiguredBlocks, pipelineBlocks, trainResults]);

  // ── Reset project ─────────────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    // Clear backend session (trained model, events, training status)
    const pid = slugify(config.projectName);
    if (pid && pid !== "demo") {
      try {
        await fetch(`${API_BASE_URL}/session/clear/${pid}`, { method: "POST" });
      } catch {
        // Non-fatal — backend may be unreachable; frontend is cleared regardless
      }
    }
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
    setTrainResults(null);
    setShowResetConfirm(false);
  }, [config.projectName]);

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

  // ── Setup submit (accepts optional config override for onboarding path) ──
  async function handleSetupSubmit(cfgOverride) {
    const cfg = cfgOverride ?? config;
    setSubmitLoading(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/project/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:                    cfg.projectName || "demo",
          sensor_type:             cfg.sensorType,
          connection_type:         cfg.connectionType,
          trigger_type:            cfg.triggerType,
          trigger_config:          cfg.triggerConfig,
          target_mcu:              cfg.targetMcu,
          application_description: cfg.applicationDescription || null,
          hardware_preprocessing:  cfg.hardwarePreprocessing  || null,
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
          onOnboardingComplete={(finalConfig, finalClasses) => {
            setConfig(finalConfig);
            setClasses(finalClasses);
            setActiveClassId(finalClasses[0]?.id ?? "cls-event");
            handleSetupSubmit(finalConfig);
          }}
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
          onTrainDone={(results) => setTrainResults(results)}
        />
      );
    }
    if (currentKey === "validate") {
      return (
        <ValidateScreen
          projectId={projectId}
          trainResults={trainResults}
          pipelineConfig={pipelineConfig}
          onGoToTrain={() => setActiveStep(3)}
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

  // ── Full-screen onboarding for brand-new projects ────────────────────────────
  if (activeStep === 0 && !config.projectName) {
    return (
      <>
        <FlowFieldBackground />
        <NewOnboarding
          onComplete={(finalConfig, finalClasses) => {
            setConfig(finalConfig);
            setClasses(finalClasses);
            setActiveClassId(finalClasses[0]?.id ?? "cls-event");
            handleSetupSubmit(finalConfig);
          }}
        />
      </>
    );
  }

  return (
    <div className="flex h-screen font-sans overflow-hidden" style={{ background: "#ffffff", color: "#0a0a0a", position: "relative" }}>
      <FlowFieldBackground />

      {/* Content sits above canvas */}
      <div className="flex flex-1 min-w-0 h-full" style={{ position: "relative", zIndex: 1 }}>
        <Sidebar
          activeStep={showRecordings ? -1 : activeStep}
          onResetRequest={() => setShowResetConfirm(true)}
          onOpenSettings={() => { setShowRecordings(false); setActiveStep(0); }}
          onOpenRecordings={() => setShowRecordings((v) => !v)}
          showRecordings={showRecordings}
        />

        {/* Reset confirmation overlay */}
        {showResetConfirm && (
          <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(10,10,10,0.45)" }}>
            <div
              className="rounded-xl p-6 max-w-sm w-full mx-4"
              style={{
                background: "#ffffff",
                border: "1px solid #ebeae5",
                boxShadow: "0 24px 60px rgba(0,0,0,0.12)",
              }}
            >
              <h2 className="text-sm font-bold mb-2" style={{ fontFamily: "'Syne', sans-serif", color: "#0a0a0a" }}>Reset Project?</h2>
              <p className="text-xs leading-relaxed mb-5" style={{ color: "#6b6a63" }}>
                This will clear all data and start a new project. This cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="px-4 py-2 text-xs rounded transition-colors"
                  style={{ border: "1px solid #d8d7d0", color: "#6b6a63", background: "#ffffff" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-xs rounded transition-colors"
                  style={{ background: "#ef4444", color: "#fff" }}
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
          <header
            className="px-8 py-4 flex items-center justify-between"
            style={{
              borderBottom: "1px solid #ebeae5",
              background: "rgba(255,255,255,0.90)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div>
              <h1
                className="text-sm font-bold uppercase tracking-widest"
                style={{
                  fontFamily: "'Syne', sans-serif",
                  color: "#0a0a0a",
                  letterSpacing: "0.12em",
                }}
              >
                {showRecordings ? "Recordings" : STEPS[activeStep].label}
              </h1>
              <p className="text-xs mt-0.5" style={{ color: "#8a8982", fontFamily: "'DM Mono', monospace" }}>
                {showRecordings
                  ? "cv accuracy · data quality"
                  : `${String(activeStep + 1).padStart(2, "0")} / ${String(STEPS.length).padStart(2, "0")}`}
              </p>
            </div>

            {/* Step progress dots — hidden on Recordings view */}
            {!showRecordings && (
              <div className="flex items-center gap-1.5">
                {STEPS.map((s, i) => (
                  <span
                    key={s.key}
                    className="w-2 h-2 rounded-full transition-colors"
                    style={{
                      background: i === activeStep
                        ? "#0a0a0a"
                        : i < activeStep
                          ? "#b0afa8"
                          : "#ebeae5",
                    }}
                  />
                ))}
              </div>
            )}
          </header>

          {/* Screen body */}
          <main className="flex-1 min-h-0 px-8 py-8 overflow-y-auto">
            {showRecordings
              ? <RecordingsScreen projectId={projectId} />
              : renderScreen()}
          </main>

          {/* Bottom nav bar — hidden on pipeline and recordings */}
          {!showRecordings && currentKey !== "pipeline" && (
            <footer
              className="px-8 py-4 flex items-center justify-between"
              style={{
                borderTop: "1px solid #ebeae5",
                background: "rgba(255,255,255,0.90)",
                backdropFilter: "blur(12px)",
              }}
            >
              <button
                onClick={goBack}
                disabled={activeStep === 0}
                className="px-5 py-2 rounded text-sm tracking-wide transition-all"
                style={{
                  border: "1px solid #d8d7d0",
                  color: activeStep === 0 ? "#d8d7d0" : "#6b6a63",
                  cursor: activeStep === 0 ? "not-allowed" : "pointer",
                  background: "#ffffff",
                }}
              >
                ← Back
              </button>

              <span
                className="text-xs tracking-widest uppercase"
                style={{ color: "#b0afa8", fontFamily: "'DM Mono', monospace" }}
              >
                {STEPS[activeStep].label}
              </span>

              <button
                onClick={handleNext}
                disabled={activeStep === STEPS.length - 1 || submitLoading}
                className="px-5 py-2 rounded text-sm tracking-wide transition-all min-w-[90px] text-center"
                style={{
                  background: activeStep === STEPS.length - 1
                    ? "#ebeae5"
                    : submitLoading
                      ? "#6b6a63"
                      : "#0a0a0a",
                  color: activeStep === STEPS.length - 1
                    ? "#b0afa8"
                    : "#ffffff",
                  cursor: activeStep === STEPS.length - 1 ? "not-allowed" : "pointer",
                  boxShadow: activeStep < STEPS.length - 1 && !submitLoading
                    ? "0 4px 14px rgba(0,0,0,0.14)"
                    : "none",
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 600,
                }}
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
    </div>
  );
}
