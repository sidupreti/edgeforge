import React, { useEffect, useMemo, useState } from "react";
import API_BASE_URL from "../config";

/**
 * Dataset-level 2-D projection shown on the Collect screen.
 * One point per recording (PCA of stored channel-profile stats), coloured by
 * class — lets a user spot a mislabelled or noisy recording BEFORE generating
 * features (a point sitting inside another class's cluster is suspicious).
 */
export default function DatasetExplorer({ projectId, classes, onInspect }) {
  const [points, setPoints]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [hover, setHover]     = useState(null);

  const colorFor = useMemo(() => {
    const m = {};
    (classes || []).forEach((c) => { if (c?.name) m[c.name] = c.color; });
    return (label) => m[label] || "#b0afa8";
  }, [classes]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(`${API_BASE_URL}/datasets/explorer/${projectId}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { if (!cancelled) setPoints(d.points || []); })
      .catch((e) => { if (!cancelled) setError(e.message || "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const W = 560, H = 240, PAD = 22;
  const scaled = useMemo(() => {
    if (!points || !points.length) return [];
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const sx = (v) => PAD + ((v - minX) / (maxX - minX || 1)) * (W - 2 * PAD);
    const sy = (v) => H - PAD - ((v - minY) / (maxY - minY || 1)) * (H - 2 * PAD);
    return points.map((p) => ({ ...p, cx: sx(p.x), cy: sy(p.y) }));
  }, [points]);

  const legendClasses = useMemo(() => {
    const seen = new Set((points || []).map((p) => p.label));
    return (classes || []).filter((c) => seen.has(c.name));
  }, [points, classes]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white/70 p-3 mb-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500"
          style={{ fontFamily: "'DM Mono', monospace" }}>
          Dataset explorer
        </span>
        <span className="text-[10px] text-gray-400">
          {loading ? "projecting…" : points ? `${points.length} recordings · PC1 × PC2` : ""}
        </span>
      </div>

      {error && <p className="text-[10px] text-red-500 py-6 text-center">Couldn’t project dataset: {error}</p>}
      {!error && points && !points.length && (
        <p className="text-[10px] text-gray-400 py-6 text-center">No recordings to project yet.</p>
      )}

      {!error && scaled.length > 0 && (
        <>
          <div style={{ position: "relative" }}>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
              <rect x="1" y="1" width={W - 2} height={H - 2} rx="8"
                fill="none" stroke="#f0efe9" />
              {scaled.map((p) => (
                <circle
                  key={p.dataset_id}
                  cx={p.cx} cy={p.cy}
                  r={hover && hover.dataset_id === p.dataset_id ? 6 : 4}
                  fill={colorFor(p.label)}
                  fillOpacity={p.quarantined ? 0.35 : 0.8}
                  stroke={p.pool === "test" ? "#0a0a0a" : "#fff"}
                  strokeWidth={p.pool === "test" ? 1.4 : 0.8}
                  style={{ cursor: onInspect ? "pointer" : "default", transition: "r .1s" }}
                  onMouseEnter={() => setHover(p)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onInspect && onInspect(p)}
                />
              ))}
            </svg>
            {hover && (
              <div style={{
                position: "absolute",
                left: Math.min(hover.cx / W * 100, 78) + "%",
                top: Math.max(hover.cy / H * 100 - 18, 2) + "%",
                transform: "translate(-50%, -100%)",
                background: "#0a0a0a", color: "#fff",
                fontSize: 10, padding: "4px 8px", borderRadius: 6,
                whiteSpace: "nowrap", pointerEvents: "none",
                fontFamily: "'DM Mono', monospace", zIndex: 5,
              }}>
                {hover.filename} · {hover.label}
                {hover.pool === "test" ? " · test" : ""}
                {hover.quarantined ? " · quarantined" : ""}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap mt-1.5">
            {legendClasses.map((c) => (
              <span key={c.id || c.name} className="flex items-center gap-1 text-[10px] text-gray-500">
                <span style={{ width: 8, height: 8, borderRadius: 4, background: c.color, display: "inline-block" }} />
                {c.name}
              </span>
            ))}
            <span className="flex items-center gap-1 text-[10px] text-gray-400 ml-auto">
              <span style={{ width: 8, height: 8, borderRadius: 4, border: "1.4px solid #0a0a0a", display: "inline-block" }} />
              held-out (test)
            </span>
          </div>
          <p className="text-[10px] text-gray-400 mt-1 leading-snug">
            A point sitting inside another colour’s cluster is a likely mislabel or noisy recording — inspect it before generating features.
          </p>
        </>
      )}
    </div>
  );
}
