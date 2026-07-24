import React, { useState, useEffect } from "react";
import API_BASE_URL from "../config";

const CHIPS = [
  { id: "generic", label: "Generic ARM",  sub: "Cortex-M / C99" },
  { id: "esp32",   label: "ESP32",        sub: "Xtensa LX6 240 MHz" },
  { id: "stm32",   label: "STM32",        sub: "Cortex-M4 168 MHz" },
  { id: "nrf",     label: "nRF52840",     sub: "Cortex-M4 64 MHz" },
  { id: "arduino", label: "Arduino BLE",  sub: "nRF52840 64 MHz" },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function ExportScreen({ projectId, exportPrecision = "int8", setExportPrecision, exportPreset, quantResult }) {
  const [chip,          setChip]          = useState("generic");
  const [runtime,       setRuntime]       = useState("lean");   // "lean" | "tflite"
  const [precision,     setPrecision]     = useState(exportPrecision);
  const [summary,       setSummary]       = useState(null);
  const [preview,       setPreview]       = useState(null);
  const [previewLoading,setPreviewLoading]= useState(false);
  const [downloading,   setDownloading]   = useState(false);
  const [downloadError, setDownloadError] = useState(null);
  const [tfliteInfo,    setTfliteInfo]    = useState(null);

  const effectiveProjectId = projectId || "demo-project";

  // keep local precision in sync with the preset chosen on the Train screen
  useEffect(() => { setPrecision(exportPrecision); }, [exportPrecision]);

  const exp = summary?.export;
  // int8 only offered when the model is quantizable (NN path)
  const canInt8 = exp?.quantizable !== false;
  const effPrecision = canInt8 ? precision : "float32";

  useEffect(() => {
    if (!effectiveProjectId) return;
    fetch(`${API_BASE_URL}/export/summary`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: effectiveProjectId }),
    }).then((r) => r.ok ? r.json() : null).then(setSummary).catch(() => {});
  }, [effectiveProjectId]);

  // Lean C preview (primary path). TFLite path shows the fallback message instead.
  useEffect(() => {
    if (!summary?.ready) return;
    if (runtime === "tflite") {
      setPreview(null);
      fetch(`${API_BASE_URL}/export/tflite`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: effectiveProjectId, chip }),
      }).then((r) => r.json()).then(setTfliteInfo).catch(() => {});
      return;
    }
    setTfliteInfo(null);
    setPreviewLoading(true);
    fetch(`${API_BASE_URL}/export/c`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: effectiveProjectId, chip, precision: effPrecision, runtime: "lean" }),
    }).then((r) => r.ok ? r.text() : null)
      .then((text) => { setPreview(text); setPreviewLoading(false); })
      .catch(() => setPreviewLoading(false));
  }, [effectiveProjectId, chip, effPrecision, runtime, summary?.ready]);

  async function download() {
    if (!summary?.ready || downloading || runtime === "tflite") return;
    setDownloading(true); setDownloadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/export/c`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: effectiveProjectId, chip, precision: effPrecision, runtime: "lean" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Server ${res.status}`);
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${effectiveProjectId}_classifier${effPrecision === "int8" ? "_int8" : ""}.h`;
      a.click();
      URL.revokeObjectURL(href);
    } catch (err) { setDownloadError(err.message); }
    finally { setDownloading(false); }
  }

  const fmtKB = (b) => b == null ? "—" : (b / 1024).toFixed(2) + " KB";

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Export</h2>
        <p className="text-xs text-gray-400 mt-1">
          Interpreter-less C for on-device inference — only the ops this model uses, no runtime interpreter.
        </p>
      </div>

      {summary && !summary.ready && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-5">
          <p className="text-sm text-amber-700">{summary.reason}</p>
          <p className="text-xs text-amber-600 mt-1">Complete the Pipeline → Train flow before exporting.</p>
        </div>
      )}

      {summary?.ready && (
        <>
          <div className="border border-gray-200 rounded-xl p-5">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-4">Trained Project</p>
            <div className="grid grid-cols-2 gap-x-12 gap-y-3">
              {(summary.modality === "image"
                ? [
                    { label: "Classes", value: summary.classes.join(", ") },
                    { label: "Features", value: `${summary.n_features} (${summary.image_block === "transfer" ? "MobileNetV2 embedding" : "raw pixels"})` },
                    { label: "Architecture", value: summary.layers.join(" → ") },
                    { label: "Input", value: summary.image_block === "transfer" ? "224×224 RGB (backbone)" : `${summary.image_size}×${summary.image_size} ${summary.image_grayscale ? "grayscale" : "RGB"}` },
                    { label: "Learning block", value: summary.image_block === "transfer" ? "Transfer learning" : "Raw pixels" },
                    { label: "Modality", value: "Image classification" },
                  ]
                : [
                    { label: "Classes", value: summary.classes.join(", ") },
                    { label: "Features", value: `${summary.n_features} (${summary.fft_length}-pt FFT)` },
                    { label: "Architecture", value: summary.layers.join(" → ") },
                    { label: "Sample rate", value: `${summary.sample_rate_hz} Hz` },
                    { label: "Filter", value: summary.filter_type === "none" ? "None" : `${summary.filter_type}-pass ${summary.cutoff_hz} Hz order ${summary.order}` },
                    { label: "Window", value: `${summary.window_ms} ms` },
                  ]
              ).map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                  <p className="text-sm font-semibold text-gray-700">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Runtime + precision */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-4" data-testid="export-options">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Runtime</p>
              <div className="flex flex-col gap-2">
                <button onClick={() => setRuntime("lean")}
                  className={`flex items-start gap-2 text-left px-3 py-2 rounded-lg border transition-all ${runtime === "lean" ? "border-accent bg-accent/5" : "border-gray-200 hover:border-gray-300"}`}>
                  <span className={`text-xs font-semibold ${runtime === "lean" ? "text-accent" : "text-gray-700"}`}>Interpreter-less C</span>
                  <span className="text-[10px] text-gray-400">Primary — lean codegen, only ops used ({exp?.ops?.join(", ")}). No interpreter, smallest artifact.</span>
                </button>
                <button onClick={() => setRuntime("tflite")}
                  className={`flex items-start gap-2 text-left px-3 py-2 rounded-lg border transition-all ${runtime === "tflite" ? "border-accent bg-accent/5" : "border-gray-200 hover:border-gray-300"}`}>
                  <span className={`text-xs font-semibold ${runtime === "tflite" ? "text-accent" : "text-gray-700"}`}>TFLite Micro</span>
                  <span className="text-[10px] text-gray-400">Fallback — .tflite + interpreter, updatable without recompile. Auto-used when the lean path can't cover an op.</span>
                </button>
              </div>
            </div>

            {runtime === "lean" && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Precision</p>
                <div className="flex gap-2">
                  {[
                    { id: "int8",    label: "INT8", sub: exp?.int8 ? fmtKB(exp.int8.bytes) : "quantized", disabled: !canInt8 },
                    { id: "float32", label: "Float32", sub: exp?.float32 ? fmtKB(exp.float32.bytes) : "reference", disabled: false },
                  ].map((p) => (
                    <button key={p.id} disabled={p.disabled} onClick={() => setPrecision(p.id)}
                      className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-all disabled:opacity-40 ${
                        effPrecision === p.id ? "border-accent bg-accent/5" : "border-gray-200 hover:border-gray-300"}`}>
                      <span className={`text-xs font-semibold ${effPrecision === p.id ? "text-accent" : "text-gray-700"}`}>{p.label}</span>
                      <span className="text-[10px] text-gray-400 mt-0.5">{p.sub}</span>
                    </button>
                  ))}
                </div>
                {exportPreset && <p className="text-[10px] text-gray-400 mt-1.5">From Train preset: <span className="font-semibold text-gray-500">{exportPreset}</span></p>}
                {!canInt8 && <p className="text-[10px] text-amber-600 mt-1.5">INT8 targets the NN path; this model exports as float32.</p>}
              </div>
            )}
          </div>

          {/* Target MCU */}
          <div className="border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Target MCU</p>
            <div className="flex flex-wrap gap-2">
              {CHIPS.map((c) => (
                <button key={c.id} onClick={() => setChip(c.id)}
                  className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-all ${
                    chip === c.id ? "border-accent bg-accent/5 shadow-sm" : "border-gray-200 hover:border-gray-300"}`}>
                  <span className={`text-xs font-semibold ${chip === c.id ? "text-accent" : "text-gray-700"}`}>{c.label}</span>
                  <span className="text-[10px] text-gray-400 mt-0.5">{c.sub}</span>
                </button>
              ))}
            </div>
            {/* On-device estimate for the selected target + precision */}
            {(() => {
              const chipKey = chip === "nrf" ? "nrf52840" : chip;
              const t = exp?.per_target?.[chipKey];
              const est = t?.[effPrecision];
              if (!est) return null;
              return (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-[10px] uppercase tracking-widest text-gray-400">On-device estimate <span className="normal-case tracking-normal">· {effPrecision}</span></p>
                    <p className="text-[10px] text-gray-400">{t.name} @ {t.clock_mhz} MHz · {t.sram_kb} KB SRAM</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      ["Latency / window", `${est.latency_ms} ms`],
                      ["Peak RAM", `${est.ram_kb} KB`],
                      ["Flash (model)", `${est.flash_kb} KB`],
                    ].map(([lbl, val]) => (
                      <div key={lbl} className="rounded-lg bg-gray-50 px-3 py-2">
                        <p className="text-[9px] uppercase tracking-wider text-gray-400 mb-1">{lbl}</p>
                        <p className="text-base font-bold text-gray-800 tabular-nums leading-none">{val}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2 leading-snug">
                    Rough estimate from the model's {exp?.macs?.toLocaleString?.() ?? exp?.macs} MACs + DSP cost at the target's clock — recompute on real hardware for exact figures.
                  </p>
                </div>
              );
            })()}
          </div>

          {/* TFLite fallback — honest, user-visible message (no fake artifact) */}
          {runtime === "tflite" && tfliteInfo && (
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-5" data-testid="tflite-fallback">
              <p className="text-sm font-semibold text-amber-800">TFLite export not available in this environment</p>
              <p className="text-xs text-amber-700 mt-1.5 leading-relaxed">{tfliteInfo.message}</p>
              <p className="text-[11px] text-amber-600 mt-2">
                Lean C covers this model ({tfliteInfo.ops?.join(", ")}) → use the Interpreter-less C runtime above.
              </p>
            </div>
          )}

          {/* Lean C preview */}
          {runtime === "lean" && previewLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {runtime === "lean" && preview && !previewLoading && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <span className="text-xs text-gray-500 font-mono">classifier{effPrecision === "int8" ? "_int8" : ""}.h</span>
                <button onClick={() => navigator.clipboard.writeText(preview)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded hover:bg-gray-100">Copy</button>
              </div>
              <div className="overflow-auto" style={{ maxHeight: "360px" }}>
                <pre className="text-[11px] leading-relaxed p-5 text-gray-700 font-mono" style={{ tabSize: 4 }}>{preview}</pre>
              </div>
            </div>
          )}

          {/* Download */}
          {downloadError && <p className="text-xs text-red-500">{downloadError}</p>}
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {runtime === "lean"
                ? `Self-contained C99 header — ${effPrecision === "int8" ? "INT8 quantized" : "float32"}, real weights, compile with -lm.`
                : "TFLite path selected — see message above."}
            </p>
            <button onClick={download} disabled={downloading || runtime === "tflite"}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                downloading || runtime === "tflite"
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-accent text-white hover:bg-accent-dark shadow-sm shadow-accent/25 active:scale-95"}`}>
              {downloading ? "Downloading…" : runtime === "tflite" ? "Unavailable" : `Download ${effPrecision === "int8" ? "INT8 " : ""}.h`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
