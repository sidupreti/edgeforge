import React, { useState, useEffect } from "react";
import API_BASE_URL from "../config";

const MODEL_LABELS = { auto: "Auto-select", rf: "Random Forest", svm: "SVM", nn: "Neural Net" };

const CHIPS = [
  { id: "generic", label: "Generic ARM",  sub: "Cortex-M / C99",        freq: null,  arm: true  },
  { id: "esp32",   label: "ESP32",        sub: "Xtensa LX6 240 MHz",    freq: 240,   arm: false },
  { id: "stm32",   label: "STM32",        sub: "Cortex-M4 168 MHz",     freq: 168,   arm: true  },
  { id: "nrf",     label: "nRF52840",     sub: "Cortex-M4 64 MHz",      freq: 64,    arm: true  },
  { id: "arduino", label: "Arduino BLE",  sub: "nRF52840 64 MHz",       freq: 64,    arm: true  },
  { id: "rp2040",  label: "RP2040",       sub: "Cortex-M0+ 133 MHz",    freq: 133,   arm: true  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function generatePythonPreview(projectId, pipelineConfig, trainingStatus) {
  const results   = trainingStatus?.results;
  const classes   = results?.class_labels ?? ["class_0", "class_1"];
  const cutoff    = pipelineConfig.filter.cutoff;
  const winMs     = pipelineConfig.normalize.window;
  const bestM     = results?.models?.find((m) => m.id === results.best_model_id);
  const modelName = MODEL_LABELS[pipelineConfig.model] ?? pipelineConfig.model;
  const accuracy  = bestM ? `${Math.round(bestM.cv_accuracy * 100)}%` : "N/A";
  const date      = new Date().toISOString().split("T")[0];
  const selFeats  = Object.entries(pipelineConfig.features)
    .filter(([, v]) => v)
    .flatMap(([k]) => [`a_x__${k}`, `a_y__${k}`, `a_z__${k}`]);

  return `#!/usr/bin/env python3
"""
EdgeForge session.py — generated ${date}
Project : ${projectId ?? "demo-project"}
Model   : ${modelName}  |  CV accuracy: ${accuracy}
Classes : ${JSON.stringify(classes)}

Usage
-----
    from session import classify
    label, conf = classify(ax_samples, ay_samples, az_samples)
"""

import base64, pickle
import numpy as np
from scipy.signal import butter, filtfilt
from scipy.interpolate import CubicSpline
from scipy.stats import kurtosis as _scipy_kurtosis

# ── Pipeline config ───────────────────────────────────────────────────────────
CUTOFF_HZ         = ${cutoff}
WINDOW_MS         = ${winMs}
SAMPLE_RATE       = 100.0   # Hz
CLASSES           = ${JSON.stringify(classes)}
SELECTED_FEATURES = ${JSON.stringify(selFeats)}

# ── Embedded model & scaler (base64-encoded pickle) ──────────────────────────
_MODEL_B64  = "gASVCgAAAAAAAAB9lC..."   # truncated — full weights in download
_SCALER_B64 = "gASVCgAAAAAAAAB9lC..."   # truncated — full weights in download
_model  = pickle.loads(base64.b64decode(_MODEL_B64))
_scaler = pickle.loads(base64.b64decode(_SCALER_B64))


# ── Signal processing ─────────────────────────────────────────────────────────

def _lowpass(sig, fs=SAMPLE_RATE, cutoff=CUTOFF_HZ, order=4):
    if len(sig) < 20: return np.array(sig, dtype=float)
    nyq = fs / 2.0
    b, a = butter(order, min(cutoff, nyq * 0.95) / nyq, btype="low")
    return filtfilt(b, a, np.array(sig, dtype=float))

def _normalize(sig, window_ms=WINDOW_MS, fs=SAMPLE_RATE):
    n_out = max(2, int(window_ms * fs / 1000))
    sig   = np.array(sig, dtype=float)
    t_in  = np.linspace(0.0, 1.0, len(sig))
    return CubicSpline(t_in, sig)(np.linspace(0.0, 1.0, n_out))

def _extract(arr):
    a = np.array(arr, dtype=float)
    fft = np.fft.rfft(a); power = np.abs(fft)**2
    freqs = np.fft.rfftfreq(len(a), d=1.0/SAMPLE_RATE)
    return {"mean": float(np.mean(a)), "standard_deviation": float(np.std(a)),
            "root_mean_square": float(np.sqrt(np.mean(a**2))), "maximum": float(np.max(a)),
            "absolute_maximum": float(np.max(np.abs(a))), "fft_energy": float(np.sum(power)),
            "dominant_freq": float(freqs[int(np.argmax(power))]), "kurtosis": float(_scipy_kurtosis(a))}


# ── Public API ────────────────────────────────────────────────────────────────

def classify(ax, ay=None, az=None):
    n = max(2, int(WINDOW_MS * SAMPLE_RATE / 1000))
    axes = [_normalize(_lowpass(r) if len(r) >= 20 else np.array(r))
            for r in [ax, ay or [], az or []]]
    feat_dict = {}
    for sig, pfx in zip(axes, ["a_x", "a_y", "a_z"]):
        for name, val in _extract(sig).items():
            feat_dict[f"{pfx}__{name}"] = val
    X    = np.array([feat_dict.get(c, 0.0) for c in SELECTED_FEATURES]).reshape(1, -1)
    X_sc = _scaler.transform(X)
    pred = _model.predict(X_sc)[0]
    conf = float(np.max(_model.predict_proba(X_sc)[0])) if hasattr(_model, "predict_proba") else 1.0
    return CLASSES[pred] if pred < len(CLASSES) else str(pred), conf


if __name__ == "__main__":
    import math, random as _rng
    n  = int(WINDOW_MS * SAMPLE_RATE / 1000)
    t  = [i / SAMPLE_RATE for i in range(n)]
    ax = [0.35 * math.sin(2 * math.pi * 2.1 * ti) + _rng.gauss(0, 0.03) for ti in t]
    ay = [0.28 * math.sin(2 * math.pi * 3.3 * ti) + _rng.gauss(0, 0.02) for ti in t]
    az = [0.22 * math.sin(2 * math.pi * 1.7 * ti) + _rng.gauss(0, 0.02) for ti in t]
    label, confidence = classify(ax, ay, az)
    print(f"Predicted : {label}")
    print(f"Confidence: {confidence:.1%}")`;
}

function generateEfpPreview(projectId, pipelineConfig, trainingStatus) {
  const results = trainingStatus?.results;
  const classes = results?.class_labels ?? ["class_0", "class_1"];

  return JSON.stringify({
    format:      "edgeforge-package",
    version:     "1.0",
    project_id:  projectId ?? "demo-project",
    exported_at: new Date().toISOString(),
    pipeline: {
      cutoff_hz:         pipelineConfig.filter.cutoff,
      window_ms:         pipelineConfig.normalize.window,
      interpolation:     pipelineConfig.normalize.interpolation,
      selected_features: Object.entries(pipelineConfig.features)
        .filter(([, v]) => v)
        .flatMap(([k]) => [`a_x__${k}`, `a_y__${k}`, `a_z__${k}`]),
    },
    classes,
    training_results: results
      ? {
          best_model_id:    results.best_model_id,
          confusion_matrix: results.confusion_matrix,
          class_labels:     results.class_labels,
          models:           results.models?.map((m) => ({
            id: m.id, name: m.name,
            accuracy: m.accuracy, cv_accuracy: m.cv_accuracy,
          })),
        }
      : null,
  }, null, 2);
}

function generateCPreview(projectId, pipelineConfig, trainingStatus, chip) {
  const results   = trainingStatus?.results;
  const classes   = results?.class_labels ?? ["class_0", "class_1"];
  const cutoff    = pipelineConfig.filter.cutoff;
  const winMs     = pipelineConfig.normalize.window;
  const nSamples  = Math.max(2, Math.round((winMs * 100) / 1000));
  const featCount = Object.values(pipelineConfig.features).filter(Boolean).length * 3;
  const bestM     = results?.models?.find((m) => m.id === results.best_model_id);
  const modelName = bestM ? MODEL_LABELS[bestM.id] ?? bestM.id : "Auto-select";
  const chipObj   = CHIPS.find((c) => c.id === chip) ?? CHIPS[0];
  const chipNote  = chipObj.arm
    ? `/* Target: ${chipObj.label} — consider CMSIS-DSP for ef_dom_freq */`
    : `/* Target: ${chipObj.label} — IRAM_ATTR on hot paths recommended */`;

  return `/*
 * EdgeForge — auto-generated on-device classifier
 * -----------------------------------------------
 * Project  : ${projectId ?? "demo-project"}
 * Model    : ${modelName}
 * Classes  : ${JSON.stringify(classes)}
 * Features : ${featCount}
 * ${chipNote.slice(3, -3).trim()}
 *
 * Usage
 * -----
 *   #include "classifier.h"
 *   int8_t idx = ef_classify(ax, ay, az, EF_WINDOW_SAMPLES);
 *   const char *label = EF_CLASSES[idx];
 *
 * Note: weights are placeholders — download for real values.
 */

#pragma once
#include <stdint.h>
#include <math.h>
#include <string.h>

/* ── Pipeline config ─────────────────────────────────────────────────────── */
#define EF_SAMPLE_RATE_HZ  100
#define EF_CUTOFF_HZ       ${cutoff}
#define EF_WINDOW_MS       ${winMs}
#define EF_WINDOW_SAMPLES  ${nSamples}
#define EF_N_CLASSES       ${classes.length}
#define EF_N_FEATURES      ${featCount}

/* ── Class labels ────────────────────────────────────────────────────────── */
static const char *EF_CLASSES[${classes.length}] = { ${classes.map((c) => `"${c}"`).join(", ")} };

/* ── Butterworth IIR coefficients — order 4 ──────────────────────────────── */
/* (real values computed from cutoff at download time) */
static const float EF_FILTER_B[5] = { 0.0f, 0.0f, 0.0f, 0.0f, 0.0f };
static const float EF_FILTER_A[5] = { 1.0f, 0.0f, 0.0f, 0.0f, 0.0f };

/* ── Model weights — truncated preview ───────────────────────────────────── */
/* Download the full header for complete weight arrays */

/* ── Public API ──────────────────────────────────────────────────────────── */
static int8_t ef_classify(
    const float *ax, const float *ay, const float *az, uint16_t n);`;
}

// ── Option card ────────────────────────────────────────────────────────────────

function OptionCard({ id, selected, onSelect, icon, title, subtitle, tag, tagColor, comingSoon, children }) {
  return (
    <button
      onClick={() => onSelect(id)}
      className={`relative text-left rounded-xl border-2 p-5 transition-all w-full ${
        selected
          ? "border-accent shadow-sm shadow-accent/20"
          : "border-gray-200 hover:border-gray-300"
      }`}
      style={selected ? { backgroundColor: "rgba(29,158,117,0.04)" } : {}}
    >
      {tag && (
        <span
          className={`absolute top-3 right-3 text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${tagColor}`}
        >
          {tag}
        </span>
      )}

      {/* Icon */}
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center mb-4 ${
          selected ? "bg-accent/15" : "bg-gray-100"
        }`}
      >
        <svg
          viewBox="0 0 20 20"
          className={`w-5 h-5 ${selected ? "text-accent" : "text-gray-400"}`}
          fill="none"
        >
          {icon}
        </svg>
      </div>

      <p className={`text-sm font-bold mb-1 ${selected ? "text-accent" : "text-gray-700"}`}>
        {title}
      </p>
      <p className="text-xs text-gray-400 leading-relaxed">{subtitle}</p>

      {comingSoon && (
        <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 1a5 5 0 100 10A5 5 0 006 1zm0 4.5a.5.5 0 01.5.5v2a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm0-2a.75.75 0 110 1.5.75.75 0 010-1.5z"/>
          </svg>
          Coming soon
        </div>
      )}

      {/* Selection ring */}
      {selected && (
        <div className="absolute top-3 left-3 w-2 h-2 rounded-full bg-accent" />
      )}
    </button>
  );
}

// ── Code preview block ─────────────────────────────────────────────────────────

function CodePreview({ code, language = "python" }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="border border-gray-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-gray-700/60">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            {["#ef4444", "#f59e0b", "#22c55e"].map((c) => (
              <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
            ))}
          </div>
          <span className="text-xs text-gray-400 ml-2">
            {language === "python" ? "session.py" : language === "c" ? "classifier.h" : "project.efp"}
          </span>
        </div>
        <button
          onClick={copy}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 rounded hover:bg-gray-800"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>

      {/* Code body */}
      <div
        className="overflow-auto"
        style={{ maxHeight: "360px", background: "#0f172a" }}
      >
        <pre
          className="text-xs leading-relaxed p-5 text-gray-300 font-mono"
          style={{ tabSize: 4 }}
        >
          {code}
        </pre>
      </div>
    </div>
  );
}

// ── Summary card ───────────────────────────────────────────────────────────────

function SummaryCard({ pipelineConfig, trainingStatus }) {
  const results   = trainingStatus?.results;
  const bestId    = results?.best_model_id;
  const bestModel = results?.models?.find((m) => m.id === bestId);
  const modelName = bestId ? MODEL_LABELS[bestId] ?? bestId : MODEL_LABELS[pipelineConfig.model];
  const accuracy  = bestModel ? `${Math.round(bestModel.cv_accuracy * 100)}%` : "—";
  const classes   = results?.class_labels ?? [];
  const featCount = Object.values(pipelineConfig.features).filter(Boolean).length;

  const rows = [
    {
      label: "Model",
      value: modelName,
      badge: bestModel ? (
        <span className="ml-2 text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded font-semibold">
          best
        </span>
      ) : null,
    },
    { label: "Validation accuracy", value: accuracy },
    {
      label: "Classes",
      value: classes.length > 0
        ? classes.join(", ")
        : "—",
    },
    {
      label: "Pipeline",
      value: `${pipelineConfig.filter.cutoff} Hz → ${pipelineConfig.normalize.window} ms → ${featCount} feature${featCount !== 1 ? "s" : ""}`,
    },
  ];

  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <p className="text-xs text-gray-400 uppercase tracking-widest mb-4">Project summary</p>
      <div className="grid grid-cols-2 gap-x-12 gap-y-3">
        {rows.map(({ label, value, badge }) => (
          <div key={label}>
            <p className="text-xs text-gray-400 mb-0.5">{label}</p>
            <p className="text-sm font-semibold text-gray-700 flex items-center">
              {value}
              {badge}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Chip selector ──────────────────────────────────────────────────────────────

function ChipSelector({ chip, setChip }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CHIPS.map((c) => (
        <button
          key={c.id}
          onClick={() => setChip(c.id)}
          className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-all ${
            chip === c.id
              ? "border-accent bg-accent/5 shadow-sm"
              : "border-gray-200 hover:border-gray-300"
          }`}
        >
          <span className={`text-xs font-semibold ${chip === c.id ? "text-accent" : "text-gray-700"}`}>
            {c.label}
          </span>
          <span className="text-[10px] text-gray-400 mt-0.5">{c.sub}</span>
        </button>
      ))}
    </div>
  );
}

// ── Resource usage estimate ─────────────────────────────────────────────────────

function ResourceUsage({ trainingStatus, pipelineConfig, chip }) {
  const results    = trainingStatus?.results;
  const modelId    = results?.best_model_id ?? "rf";
  const nClasses   = results?.class_labels?.length ?? 2;
  const nFeat      = Object.values(pipelineConfig.features).filter(Boolean).length * 3;
  const chipObj    = CHIPS.find((c) => c.id === chip) ?? CHIPS[0];
  const freqMhz    = chipObj.freq ?? 120;

  // Rough flash estimates (bytes)
  const flashModel = modelId === "rf"
    ? 8 * 200 * 5 * 4          // 8 trees × ~200 nodes × 5 arrays × 4 bytes
    : modelId === "svm"
    ? nFeat * 50 * 4 * 2       // ~50 SVs × n_feat × dual_coef
    : (nFeat * 64 + 64 * 32 + 32 * nClasses) * 4;  // NN weights
  const flashScaler  = nFeat * 2 * 4;
  const flashFilter  = 5 * 2 * 4;
  const flashTotal   = flashModel + flashScaler + flashFilter + 1024; // +1KB code
  const flashKb      = (flashTotal / 1024).toFixed(1);

  // RAM: filter state + feature vec + model buffer
  const ramFeat    = nFeat * 4;
  const ramFilter  = 3 * 4 * 4;  // 3 axes × 4 state values × 4 bytes
  const ramWindows = 3 * (Math.max(2, Math.round((pipelineConfig.normalize.window * 100) / 1000))) * 4;
  const ramModel   = modelId === "nn" ? 64 * 4 : 0;
  const ramTotal   = ramFeat + ramFilter + ramWindows + ramModel;
  const ramKb      = (ramTotal / 1024).toFixed(1);

  // Inference time estimate (very rough, based on dominant_freq DFT)
  const nSamples   = Math.max(2, Math.round((pipelineConfig.normalize.window * 100) / 1000));
  const dftOps     = nSamples * nSamples * 3;  // 3 axes
  const cyclesEst  = dftOps * 20 + nFeat * 50;  // ~20 cycles/op, 50 cycles/feat op
  const timeMs     = ((cyclesEst / (freqMhz * 1e6)) * 1000).toFixed(1);

  const rows = [
    { label: "Flash (weights + code)", value: `~${flashKb} KB` },
    { label: "RAM (buffers + state)",  value: `~${ramKb} KB`   },
    { label: "Inference time",         value: `~${timeMs} ms @ ${freqMhz} MHz` },
  ];

  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Resource estimates</p>
      <div className="grid grid-cols-3 gap-4">
        {rows.map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs text-gray-400 mb-0.5">{label}</p>
            <p className="text-sm font-semibold text-gray-700">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-300 mt-3">
        Estimates assume mean/std/rms/peak features. DFT-based features (dominant_freq) dominate inference time.
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const OPTIONS = [
  {
    id:       "python",
    title:    "Python session script",
    subtitle: "Full inference pipeline with embedded model weights. Run on a laptop connected to your sensor.",
    icon:     (
      <>
        <path d="M10 2C6.686 2 5 3.343 5 5v1h5v1H4.5C3.119 7 2 8.119 2 9.5S3.119 12 4.5 12H5v1c0 1.657 1.686 3 5 3s5-1.343 5-3v-1h.5C16.881 12 18 10.881 18 9.5S16.881 7 15.5 7H15V6c0-1.657-1.686-3-5-3z"
          stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round"/>
        <circle cx="7.5" cy="9.5" r="1" fill="currentColor"/>
        <circle cx="12.5" cy="12.5" r="1" fill="currentColor"/>
      </>
    ),
    tag:      "Recommended",
    tagColor: "bg-accent/10 text-accent",
  },
  {
    id:       "c",
    title:    "C header file",
    subtitle: "On-device inference — runs directly on the target MCU without an OS or runtime.",
    icon:     (
      <>
        <rect x="2" y="3" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <path d="M8 7.5C7.5 6.5 6 6 5 7.5v3C6 12 7.5 11.5 8 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M12 7.5C11.5 6.5 10 6 9 7.5v3c1 1.5 2.5 1 3 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </>
    ),
    tag:      ".h",
    tagColor: "bg-blue-50 text-blue-500",
  },
  {
    id:       "efp",
    title:    "EdgeForge package",
    subtitle: "Full project bundle — pipeline config, class labels, and training results as a portable .efp file.",
    icon:     (
      <>
        <rect x="3" y="4" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <path d="M7 4V2.5M10 4V2M13 4V2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <path d="M7 8h6M7 11h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </>
    ),
    tag:      ".efp",
    tagColor: "bg-gray-100 text-gray-500",
  },
];

export default function ExportScreen({ projectId, pipelineConfig }) {
  const [selected,       setSelected]       = useState("python");
  const [chip,           setChip]           = useState("generic");
  const [trainingStatus, setTrainingStatus] = useState(null);
  const [downloading,    setDownloading]    = useState(false);
  const [downloadError,  setDownloadError]  = useState(null);
  const [localProjectId, setLocalProjectId] = useState(null);

  // Fetch training results once on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/train/status`)
      .then((r) => r.json())
      .then(setTrainingStatus)
      .catch(() => {});
  }, []);

  // Auto-create demo project if projectId missing
  useEffect(() => {
    if (projectId || localProjectId) return;
    fetch(`${API_BASE_URL}/project/create`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "demo-project", sensor_type: "Accelerometer (IMU)",
        connection_type: "File Upload", trigger_type: "Automatic",
        trigger_config: {}, target_mcu: "Arduino Nano 33 BLE",
      }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.project_id) setLocalProjectId(d.project_id); })
      .catch(() => {});
  }, [projectId, localProjectId]);

  const effectiveProjectId = projectId ?? localProjectId ?? "demo-project";
  const canDownload        = Boolean(trainingStatus?.results);

  async function download() {
    if (!canDownload || downloading) return;
    setDownloading(true);
    setDownloadError(null);

    const url = selected === "python"
      ? `${API_BASE_URL}/export/python/${effectiveProjectId}`
      : selected === "c"
      ? `${API_BASE_URL}/export/c/${effectiveProjectId}?chip=${chip}`
      : `${API_BASE_URL}/export/efp/${effectiveProjectId}`;
    const filename = selected === "python"
      ? "session.py"
      : selected === "c"
      ? `${effectiveProjectId}_classifier.h`
      : `${effectiveProjectId}.efp`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `Server error ${res.status}`);
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      setDownloadError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  const previewCode = selected === "python"
    ? generatePythonPreview(effectiveProjectId, pipelineConfig, trainingStatus)
    : selected === "c"
    ? generateCPreview(effectiveProjectId, pipelineConfig, trainingStatus, chip)
    : selected === "efp"
    ? generateEfpPreview(effectiveProjectId, pipelineConfig, trainingStatus)
    : null;

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">

      {/* ── Option cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {OPTIONS.map((opt) => (
          <OptionCard
            key={opt.id}
            {...opt}
            selected={selected === opt.id}
            onSelect={setSelected}
          />
        ))}
      </div>

      {/* ── C: chip selector + resource estimates ────────────────────────────── */}
      {selected === "c" && (
        <div className="flex flex-col gap-3">
          <div className="border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Target MCU</p>
            <ChipSelector chip={chip} setChip={setChip} />
          </div>
          <ResourceUsage trainingStatus={trainingStatus} pipelineConfig={pipelineConfig} chip={chip} />
        </div>
      )}

      {/* ── Code / JSON preview + download ───────────────────────────────────── */}
      {previewCode && (
        <div className="flex flex-col gap-3">
          <CodePreview
            code={previewCode}
            language={selected === "python" ? "python" : "json"}
          />

          {/* Download error */}
          {downloadError && (
            <p className="text-xs text-red-500 px-1">{downloadError}</p>
          )}

          {/* Download button */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {selected === "python"
                ? "The downloaded file contains full model weights and is self-contained."
                : selected === "c"
                ? "The .h header is self-contained — no external dependencies, compile with -lm."
                : "The .efp bundle includes pipeline config, class labels, and training results."}
            </p>
            <button
              onClick={download}
              disabled={!canDownload || downloading}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                !canDownload
                  ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                  : downloading
                  ? "bg-accent/60 text-white cursor-wait"
                  : "bg-accent text-white hover:bg-accent-dark shadow-sm shadow-accent/25 active:scale-95"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {downloading
                ? "Downloading…"
                : selected === "python"
                ? "Download session.py"
                : selected === "c"
                ? `Download classifier.h`
                : `Download ${effectiveProjectId}.efp`}
            </button>
          </div>

          {!canDownload && trainingStatus?.state !== "done" && (
            <p className="text-xs text-gray-400 text-right">
              Complete training on Screen 4 to unlock download.
            </p>
          )}
        </div>
      )}

      {/* ── Summary card ──────────────────────────────────────────────────────── */}
      <SummaryCard pipelineConfig={pipelineConfig} trainingStatus={trainingStatus} />
    </div>
  );
}
