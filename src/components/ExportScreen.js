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

export default function ExportScreen({ projectId }) {
  const [chip,          setChip]          = useState("generic");
  const [summary,       setSummary]       = useState(null);
  const [preview,       setPreview]       = useState(null);
  const [previewLoading,setPreviewLoading]= useState(false);
  const [downloading,   setDownloading]   = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  const effectiveProjectId = projectId || "demo-project";

  // Fetch trained-project summary on mount
  useEffect(() => {
    if (!effectiveProjectId) return;
    fetch(`${API_BASE_URL}/export/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: effectiveProjectId }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then(setSummary)
      .catch(() => {});
  }, [effectiveProjectId]);

  // Fetch C header preview
  useEffect(() => {
    if (!summary?.ready) return;
    setPreviewLoading(true);
    fetch(`${API_BASE_URL}/export/c`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: effectiveProjectId, chip }),
    })
      .then((r) => r.ok ? r.text() : null)
      .then((text) => { setPreview(text); setPreviewLoading(false); })
      .catch(() => setPreviewLoading(false));
  }, [effectiveProjectId, chip, summary?.ready]);

  async function download() {
    if (!summary?.ready || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/export/c`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: effectiveProjectId, chip }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Server ${res.status}`);
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${effectiveProjectId}_classifier.h`;
      a.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      setDownloadError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Export</h2>
        <p className="text-xs text-gray-400 mt-1">
          Download the trained model as a C header for on-device inference.
        </p>
      </div>

      {/* Not ready */}
      {summary && !summary.ready && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-5">
          <p className="text-sm text-amber-700">{summary.reason}</p>
          <p className="text-xs text-amber-600 mt-1">
            Complete the Pipeline → Train flow before exporting.
          </p>
        </div>
      )}

      {/* Summary — all from project config, nothing hardcoded */}
      {summary?.ready && (
        <>
          <div className="border border-gray-200 rounded-xl p-5">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-4">Trained Project</p>
            <div className="grid grid-cols-2 gap-x-12 gap-y-3">
              {[
                { label: "Classes", value: summary.classes.join(", ") },
                { label: "Features", value: `${summary.n_features} (${summary.fft_length}-pt FFT)` },
                { label: "Architecture", value: summary.layers.join(" → ") },
                { label: "Sample rate", value: `${summary.sample_rate_hz} Hz` },
                { label: "Filter", value: summary.filter_type === "none" ? "None" : `${summary.filter_type}-pass ${summary.cutoff_hz} Hz order ${summary.order}` },
                { label: "Window", value: `${summary.window_ms} ms` },
                { label: "Anomaly", value: summary.has_anomaly ? `${summary.anomaly_axes} axes, threshold ${summary.anomaly_threshold?.toFixed(2)}` : "Not trained" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                  <p className="text-sm font-semibold text-gray-700">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Chip selector */}
          <div className="border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Target MCU</p>
            <div className="flex flex-wrap gap-2">
              {CHIPS.map((c) => (
                <button key={c.id} onClick={() => setChip(c.id)}
                  className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-all ${
                    chip === c.id ? "border-accent bg-accent/5 shadow-sm" : "border-gray-200 hover:border-gray-300"
                  }`}>
                  <span className={`text-xs font-semibold ${chip === c.id ? "text-accent" : "text-gray-700"}`}>{c.label}</span>
                  <span className="text-[10px] text-gray-400 mt-0.5">{c.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          {previewLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {preview && !previewLoading && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <span className="text-xs text-gray-500 font-mono">classifier.h</span>
                <button
                  onClick={() => navigator.clipboard.writeText(preview)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded hover:bg-gray-100"
                >Copy</button>
              </div>
              <div className="overflow-auto" style={{ maxHeight: "400px" }}>
                <pre className="text-[11px] leading-relaxed p-5 text-gray-700 font-mono" style={{ tabSize: 4 }}>
                  {preview}
                </pre>
              </div>
            </div>
          )}

          {/* Download */}
          {downloadError && <p className="text-xs text-red-500">{downloadError}</p>}
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Self-contained C99 header — classifier{summary.has_anomaly ? " + anomaly" : ""}, real weights, compile with -lm.
            </p>
            <button onClick={download} disabled={downloading}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                downloading
                  ? "bg-accent/60 text-white cursor-wait"
                  : "bg-accent text-white hover:bg-accent-dark shadow-sm shadow-accent/25 active:scale-95"
              }`}>
              {downloading ? "Downloading…" : "Download .h"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
