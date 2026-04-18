import React, { useState } from "react";
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

const INITIAL_CONFIG = {
  projectName:            "",
  sensorType:             "",
  connectionType:         "",
  triggerType:            "",
  triggerConfig:          {},
  targetMcu:              "",
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

export default function App() {
  const [activeStep, setActiveStep] = useState(0);
  const [config, setConfig] = useState(INITIAL_CONFIG);
  const [projectId, setProjectId] = useState(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  // Lifted from CollectScreen when /analyze-signal returns
  const [analyzeResult,    setAnalyzeResult]    = useState(null);
  const [separabilityNote, setSeparabilityNote] = useState(null);
  const [pipelineConfig,   setPipelineConfig]   = useState(INITIAL_PIPELINE_CONFIG);
  const [chatHistory,        setChatHistory]        = useState([]);
  const [pendingFlash,       setPendingFlash]       = useState(null);
  const [aiPipelineDesign,   setAiPipelineDesign]   = useState(null);
  const [aiConfiguredBlocks, setAiConfiguredBlocks] = useState({});
  const [pipelineBlocks,     setPipelineBlocks]     = useState(INITIAL_BLOCKS);

  const goBack = () => setActiveStep((s) => Math.max(s - 1, 0));

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
    setActiveStep(2); // navigate to Pipeline screen
  }

  async function handleSetupSubmit() {
    setSubmitLoading(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/project/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:                    config.projectName,
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
      const data = await res.json();
      setProjectId(data.project_id);
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
        />
      );
    }
    if (currentKey === "train") {
      return (
        <TrainScreen
          projectId={projectId}
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
      <Sidebar activeStep={activeStep} />

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

        {/* Bottom nav bar */}
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
      </div>
    </div>
  );
}
