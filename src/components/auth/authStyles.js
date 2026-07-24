// Shared inline style tokens for the auth pages — matches Legal.js / VisionOptimizer.js palette.
export const INK = "#0a0a0a";
export const SUB = "#4b4a44";
export const MUTE = "#8a897f";
export const LINE = "#ebeae5";
export const PANEL = "#f8f7f3";
export const TEAL = "#1D9E75";
export const RED = "#EF4444";
export const SYNE = "'Syne', sans-serif";
export const MONO = "'DM Mono', monospace";

export const inputStyle = {
  width: "100%", fontFamily: "'DM Sans', sans-serif", fontSize: 14,
  color: INK, background: "#fbfaf6", border: `1px solid #d8d7d0`, borderRadius: 8,
  padding: "12px 14px", outline: "none", boxSizing: "border-box", marginBottom: 14,
};

export const labelStyle = {
  display: "block", fontFamily: MONO, fontSize: 11, textTransform: "uppercase",
  letterSpacing: "0.08em", color: MUTE, marginBottom: 6,
};

export const primaryBtn = {
  width: "100%", fontFamily: SYNE, fontSize: 15, fontWeight: 600,
  background: INK, color: "#fff", border: "none", borderRadius: 9,
  padding: "13px 20px", cursor: "pointer", marginTop: 4,
};

export const googleBtn = {
  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
  fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500,
  background: "#fff", color: INK, border: `1px solid ${LINE}`, borderRadius: 9,
  padding: "12px 20px", cursor: "pointer", marginBottom: 18,
};
