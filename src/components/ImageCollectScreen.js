import React, { useEffect, useRef, useState, useCallback } from "react";
import API_BASE_URL from "../config";

// Image-classification data collection — mirrors Edge Impulse's image "Data
// acquisition": upload images per class into a train / test pool.
export default function ImageCollectScreen({ config, projectId, classes }) {
  const [pool, setPool] = useState("train");
  const [counts, setCounts] = useState({});
  const [uploading, setUploading] = useState(null);
  const [error, setError] = useState(null);
  const [previews, setPreviews] = useState({});   // label -> [dataURL,...]
  const [transferAvail, setTransferAvail] = useState(true);
  const inputRefs = useRef({});

  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/vision/status?project_id=${encodeURIComponent(projectId)}`);
      const d = await r.json();
      setCounts(d.counts || {});
      setTransferAvail(!!d.transfer_available);
    } catch { /* backend may be down */ }
  }, [projectId]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  async function handleFiles(label, fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    setError(null);
    setUploading(label);

    // client-side thumbnails (first 12)
    const thumbs = await Promise.all(files.slice(0, 12).map((f) => new Promise((res) => {
      const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsDataURL(f);
    })));
    setPreviews((p) => ({ ...p, [label]: [...(p[label] || []), ...thumbs].slice(-12) }));

    try {
      // upload in batches of 20 to keep requests small
      for (let i = 0; i < files.length; i += 20) {
        const fd = new FormData();
        fd.append("project_id", projectId);
        fd.append("label", label);
        fd.append("pool", pool);
        files.slice(i, i + 20).forEach((f) => fd.append("files", f));
        const res = await fetch(`${API_BASE_URL}/vision/upload`, { method: "POST", body: fd });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Upload failed (${res.status})`);
      }
      await refreshStatus();
    } catch (e) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  const total = (label) => (counts[label]?.train || 0) + (counts[label]?.test || 0);
  const grandTrain = Object.values(counts).reduce((s, c) => s + (c.train || 0), 0);
  const grandTest = Object.values(counts).reduce((s, c) => s + (c.test || 0), 0);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold" style={{ fontFamily: "'Syne', sans-serif" }}>Image data</h2>
        <span className="text-xs px-2 py-1 rounded-full" style={{ background: "#f3f2ec", color: "#6b6a63", fontFamily: "'DM Mono', monospace" }}>
          IMAGE CLASSIFICATION
        </span>
      </div>
      <p className="text-sm mb-6" style={{ color: "#8a8982" }}>
        Upload photos for each class into a training or test pool. {grandTrain} train · {grandTest} test images so far.
      </p>

      {/* Train / Test pool toggle */}
      <div className="flex items-center gap-2 mb-5">
        {["train", "test"].map((p) => (
          <button key={p} onClick={() => setPool(p)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{
              background: pool === p ? "#0a0a0a" : "#ffffff",
              color: pool === p ? "#ffffff" : "#6b6a63",
              border: "1px solid " + (pool === p ? "#0a0a0a" : "#d8d7d0"),
            }}>
            Add to {p} pool
          </button>
        ))}
        {!transferAvail && (
          <span className="text-[11px] ml-2" style={{ color: "#d97706" }}>
            transfer-learning backbone unavailable — raw block only
          </span>
        )}
      </div>

      {error && (
        <p className="text-xs px-3 py-2 rounded-lg mb-4" style={{ background: "#fff5f5", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}>
          {error}
        </p>
      )}

      {/* Per-class upload cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(classes || []).map((cls) => (
          <div key={cls.id} className="rounded-xl p-4" style={{ border: "1px solid #ebeae5", background: "#ffffff" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cls.color }} />
                <span className="text-sm font-semibold truncate">{cls.name}</span>
              </div>
              <span className="text-xs tabular-nums" style={{ color: "#8a8982" }}>
                {counts[cls.name]?.train || 0}tr · {counts[cls.name]?.test || 0}te
              </span>
            </div>

            {/* thumbnails */}
            <div className="grid grid-cols-4 gap-1 mb-3 min-h-[52px]">
              {(previews[cls.name] || []).slice(-8).map((src, i) => (
                <img key={i} src={src} alt="" className="w-full aspect-square object-cover rounded"
                     style={{ border: "1px solid #ebeae5" }} />
              ))}
              {!(previews[cls.name] || []).length && (
                <div className="col-span-4 flex items-center justify-center text-[11px] rounded"
                     style={{ minHeight: 52, border: "1px dashed #e2e1db", color: "#b0afa8" }}>
                  {total(cls.name) > 0 ? `${total(cls.name)} images uploaded` : "no images yet"}
                </div>
              )}
            </div>

            <input
              ref={(el) => { if (el) inputRefs.current[cls.id] = el; }}
              type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { if (e.target.files?.length) handleFiles(cls.name, e.target.files); e.target.value = ""; }}
            />
            <button
              onClick={() => inputRefs.current[cls.id]?.click()}
              disabled={uploading === cls.name}
              className="w-full text-xs font-semibold rounded-lg py-2 transition-colors"
              style={{ border: "1px solid " + cls.color + "55", color: cls.color, background: cls.color + "0d" }}>
              {uploading === cls.name ? "Uploading…" : `Upload images → ${pool}`}
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs mt-6" style={{ color: "#b0afa8" }}>
        Tip: aim for 30+ images per class per pool. Next, the Pipeline step turns images into features (raw pixels or MobileNet transfer learning).
      </p>
    </div>
  );
}
