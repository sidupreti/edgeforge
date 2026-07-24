import React from "react";
import { Link } from "react-router-dom";
import { INK, SUB, LINE, MUTE, TEAL, SYNE, MONO } from "./authStyles";

function LogoMark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-label="SensorForge logo">
      <rect x="10" y="10" width="16" height="16" rx="2.5" fill={INK} />
      <rect x="13" y="13" width="4" height="4" rx=".6" fill="#fff" />
      <rect x="19" y="13" width="4" height="4" rx=".6" fill="#fff" opacity=".75" />
      <rect x="13" y="19" width="4" height="4" rx=".6" fill="#fff" opacity=".75" />
      <rect x="19" y="19" width="4" height="4" rx=".6" fill="#fff" />
    </svg>
  );
}

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", color: INK }}>
      <nav style={{ display: "flex", alignItems: "center", padding: "18px 28px", borderBottom: `1px solid ${LINE}` }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: INK }}>
          <LogoMark />
          <span style={{ fontFamily: SYNE, fontWeight: 700, letterSpacing: "-.02em", fontSize: 17 }}>SensorForge</span>
        </Link>
      </nav>
      <div style={{ maxWidth: 400, margin: "0 auto", padding: "64px 24px 96px" }}>
        <div style={{ fontFamily: MONO, color: TEAL, fontSize: 11, letterSpacing: ".12em", marginBottom: 12 }}>● ACCOUNT</div>
        <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 28, margin: "0 0 8px" }}>{title}</h1>
        {subtitle && <p style={{ color: SUB, fontSize: 14.5, lineHeight: 1.55, margin: "0 0 28px" }}>{subtitle}</p>}
        {children}
        {footer && (
          <div style={{ marginTop: 22, fontSize: 13.5, color: MUTE, textAlign: "center" }}>{footer}</div>
        )}
      </div>
    </div>
  );
}
