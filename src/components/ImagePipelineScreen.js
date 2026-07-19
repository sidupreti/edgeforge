import React, { useState } from "react";
import API_BASE_URL from "../config";

// Image "Create impulse" — mirrors Edge Impulse's image impulse: an Image
// processing block (color mode + size) and a learning block chosen between a
// lightweight raw-pixel path and MobileNet transfer learning.
export default function ImagePipelineScreen({ projectId, savedResult, onResult, onBack, onNext }) {
  const [block, setBlock] = useState("transfer"); // "transfer" | "raw"
  const [imageSize, setImageSize] = useState(32);
  const [grayscale, setGrayscale] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const result = savedResult;

  async function generate() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/vision/generate-features`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, block, image_size: Number(imageSize), grayscale }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || `Failed (${res.status})`);
      onResult(d);
    } catch (e) {
      setError(e.message || "Feature generation failed");
    } finally {
      setLoading(false);
    }
  }

  const Card = ({ title, sub, children }) => (
    <div className="rounded-xl p-5" style={{ border: "1px solid #ebeae5", background: "#ffffff" }}>
      <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ fontFamily: "'DM Mono', monospace", color: "#8a8982" }}>{title}</p>
      {sub && <p className="text-xs mb-3" style={{ color: "#b0afa8" }}>{sub}</p>}
      {children}
    </div>
  );

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold" style={{ fontFamily: "'Syne', sans-serif" }}>Create Impulse</h2>
          <p className="text-sm" style={{ color: "#8a8982" }}>Turn images into features, then train a classifier.</p>
        </div>
        <button onClick={onBack} className="text-sm px-4 py-2 rounded" style={{ border: "1px solid #d8d7d0", color: "#6b6a63" }}>← Back</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Card title="Image block" sub="Resize + color mode applied to every image.">
          <div className="flex items-center gap-2 mb-3">
            {[
              { v: true, t: "Grayscale" },
              { v: false, t: "RGB" },
            ].map(({ v, t }) => (
              <button key={t} onClick={() => setGrayscale(v)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: grayscale === v ? "#0a0a0a" : "#fff", color: grayscale === v ? "#fff" : "#6b6a63", border: "1px solid " + (grayscale === v ? "#0a0a0a" : "#d8d7d0") }}>
                {t}
              </button>
            ))}
          </div>
          <label className="text-xs" style={{ color: "#8a8982" }}>Resize (raw block)</label>
          <div className="flex items-center gap-2 mt-1">
            {[24, 32, 48].map((s) => (
              <button key={s} onClick={() => setImageSize(s)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: imageSize === s ? "#0a0a0a" : "#fff", color: imageSize === s ? "#fff" : "#6b6a63", border: "1px solid " + (imageSize === s ? "#0a0a0a" : "#d8d7d0") }}>
                {s}×{s}
              </button>
            ))}
          </div>
        </Card>

        <Card title="Learning block" sub="How images become a feature vector.">
          {[
            { id: "transfer", t: "Transfer learning (MobileNetV2)", d: "1280-d embedding — best accuracy on real photos." },
            { id: "raw", t: "Raw pixels", d: "Flattened resized pixels — tiny, MCU-deployable via lean C." },
          ].map(({ id, t, d }) => (
            <button key={id} onClick={() => setBlock(id)}
              className="w-full text-left p-3 rounded-lg mb-2 transition-colors"
              style={{ border: "2px solid " + (block === id ? "#1D9E75" : "#e2e1db"), background: block === id ? "rgba(29,158,117,0.05)" : "#fff" }}>
              <div className="text-sm font-semibold" style={{ color: block === id ? "#1D9E75" : "#0a0a0a" }}>{t}</div>
              <div className="text-xs" style={{ color: "#8a8982" }}>{d}</div>
            </button>
          ))}
        </Card>
      </div>

      {error && (
        <p className="text-xs px-3 py-2 rounded-lg mb-4" style={{ background: "#fff5f5", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}>{error}</p>
      )}

      <div className="flex items-center gap-3 mb-6">
        <button onClick={generate} disabled={loading}
          className="px-6 py-3 rounded-xl text-white font-bold text-sm"
          style={{ fontFamily: "'Syne', sans-serif", background: loading ? "#6b6a63" : "#0a0a0a", boxShadow: "0 4px 14px rgba(0,0,0,0.14)" }}>
          {loading ? "Generating features…" : "Generate features"}
        </button>
        {result && (
          <button onClick={onNext} className="px-6 py-3 rounded-xl text-sm font-bold"
            style={{ fontFamily: "'Syne', sans-serif", border: "1px solid #0a0a0a", color: "#0a0a0a" }}>
            Train →
          </button>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            ["BLOCK", result.block],
            ["FEATURES", result.n_features],
            ["TRAIN IMAGES", result.n_train_windows],
            ["TEST IMAGES", result.n_test_windows],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl p-4" style={{ border: "1px solid #ebeae5" }}>
              <p className="text-[11px] uppercase tracking-wider" style={{ fontFamily: "'DM Mono', monospace", color: "#8a8982" }}>{k}</p>
              <p className="text-xl font-bold mt-1">{v}</p>
            </div>
          ))}
        </div>
      )}

      {result?.window_counts && (
        <div className="rounded-xl p-5" style={{ border: "1px solid #ebeae5" }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ fontFamily: "'DM Mono', monospace", color: "#8a8982" }}>Images per class</p>
          {Object.entries(result.window_counts).map(([cls, c]) => (
            <div key={cls} className="flex items-center justify-between text-sm py-1">
              <span className="font-semibold">{cls}</span>
              <span style={{ color: "#8a8982" }}>train: {c.train} · test: {c.test}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
