import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import API_BASE_URL from "../config";

/* ── Scoped CSS (same design tokens as LandingPage) ─────────────────────────── */
const CSS = `
  .sf-contact *, .sf-contact *::before, .sf-contact *::after {
    box-sizing: border-box; margin: 0; padding: 0;
  }

  .sf-contact {
    font-family: 'DM Sans', sans-serif;
    background: #ffffff;
    color: #0a0a0a;
    line-height: 1.6;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Nav (identical to landing) ── */
  .sf-contact .sf-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 40px;
    background: rgba(255,255,255,0.7);
    backdrop-filter: blur(16px) saturate(160%);
    -webkit-backdrop-filter: blur(16px) saturate(160%);
    border-bottom: 1px solid #ebeae5;
    transition: padding 0.3s;
  }
  .sf-contact .logo-wrap {
    display: flex; align-items: center; gap: 11px; text-decoration: none;
  }
  .sf-contact .logo-text {
    font-family: 'Syne', sans-serif; font-weight: 700; font-size: 19px;
    color: #0a0a0a; letter-spacing: -0.03em;
  }
  .sf-contact .nav-links { display: flex; align-items: center; gap: 36px; list-style: none; }
  .sf-contact .nav-links a {
    font-size: 14px; font-weight: 400; color: #6b6a63;
    text-decoration: none; transition: color 0.2s;
  }
  .sf-contact .nav-links a:hover { color: #0a0a0a; }
  .sf-contact .nav-cta {
    font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 600;
    background: #0a0a0a; color: #ffffff !important;
    padding: 9px 20px; border-radius: 7px; text-decoration: none;
    transition: transform 0.2s, box-shadow 0.2s; display: inline-block;
  }
  .sf-contact .nav-cta:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.18); }

  /* ── Page body ── */
  .sf-contact .page-body {
    min-height: 100vh;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 120px 40px 80px;
  }

  .sf-contact .contact-wrap {
    width: 100%; max-width: 560px;
  }

  .sf-contact .section-label {
    font-family: 'DM Mono', monospace; font-size: 11px; color: #b0afa8;
    letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 18px;
    display: flex; align-items: center; gap: 10px;
  }
  .sf-contact .section-label::before {
    content: ''; width: 24px; height: 1px; background: #b0afa8;
  }

  .sf-contact h1 {
    font-family: 'Syne', sans-serif; font-size: clamp(34px, 5vw, 52px);
    font-weight: 700; letter-spacing: -0.04em; line-height: 1.05;
    color: #0a0a0a; margin-bottom: 14px;
  }

  .sf-contact .subtitle {
    font-size: 15px; font-weight: 300; color: #6b6a63; margin-bottom: 48px; line-height: 1.65;
  }

  /* ── Form ── */
  .sf-contact .form-group { margin-bottom: 20px; }

  .sf-contact label {
    display: block; font-family: 'DM Mono', monospace; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.1em; color: #8a8982;
    margin-bottom: 7px;
  }

  .sf-contact input,
  .sf-contact textarea {
    width: 100%; font-family: 'DM Sans', sans-serif; font-size: 14px;
    color: #0a0a0a; background: #fbfaf6;
    border: 1px solid #d8d7d0; border-radius: 8px;
    padding: 12px 14px; outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    resize: vertical;
  }
  .sf-contact input::placeholder,
  .sf-contact textarea::placeholder { color: #b0afa8; }
  .sf-contact input:focus,
  .sf-contact textarea:focus {
    border-color: #0a0a0a;
    box-shadow: 0 0 0 3px rgba(10,10,10,0.07);
  }
  .sf-contact textarea { min-height: 140px; }

  .sf-contact .submit-btn {
    width: 100%; font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 600;
    background: #0a0a0a; color: #ffffff; border: none; border-radius: 9px;
    padding: 15px 24px; cursor: pointer; margin-top: 8px;
    transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
    display: flex; align-items: center; justify-content: center; gap: 9px;
  }
  .sf-contact .submit-btn:hover:not(:disabled) {
    transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,0,0,0.22);
  }
  .sf-contact .submit-btn:disabled { background: #6b6a63; cursor: not-allowed; }

  /* ── Success state ── */
  .sf-contact .success-box {
    text-align: center; padding: 48px 32px;
    border: 1px solid #ebeae5; border-radius: 16px; background: #fbfaf6;
  }
  .sf-contact .success-icon {
    width: 52px; height: 52px; background: #0a0a0a; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;
  }
  .sf-contact .success-icon svg { stroke: white; }
  .sf-contact .success-box h2 {
    font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 700;
    letter-spacing: -0.02em; margin-bottom: 10px;
  }
  .sf-contact .success-box p { font-size: 14px; color: #6b6a63; line-height: 1.65; }

  /* ── Error banner ── */
  .sf-contact .error-banner {
    background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;
    padding: 12px 14px; margin-bottom: 20px;
    font-size: 13px; color: #b91c1c; line-height: 1.5;
  }

  /* ── Footer ── */
  .sf-contact footer {
    padding: 28px 40px; border-top: 1px solid #ebeae5;
    display: flex; align-items: center; justify-content: space-between;
    background: #ffffff;
  }
  .sf-contact .footer-left { display: flex; align-items: center; gap: 11px; }
  .sf-contact .footer-copy { font-family: 'DM Mono', monospace; font-size: 11px; color: #b0afa8; }
  .sf-contact .footer-links { display: flex; gap: 26px; list-style: none; }
  .sf-contact .footer-links a { font-size: 13px; color: #8a8982; text-decoration: none; transition: color 0.2s; }
  .sf-contact .footer-links a:hover { color: #0a0a0a; }

  @media (max-width: 768px) {
    .sf-contact .sf-nav { padding: 14px 22px; }
    .sf-contact .nav-links { gap: 18px; }
    .sf-contact .nav-links a:not(.nav-cta) { display: none; }
    .sf-contact .page-body { padding: 100px 22px 60px; }
    .sf-contact footer { flex-direction: column; gap: 14px; padding: 22px; text-align: center; }
  }
`;

function LogoSvg({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-label="SensorFlow logo">
      <rect x="10" y="10" width="16" height="16" rx="2.5" fill="#0a0a0a"/>
      <rect x="13" y="13" width="4" height="4" rx="0.6" fill="white"/>
      <rect x="19" y="13" width="4" height="4" rx="0.6" fill="white" opacity="0.75"/>
      <rect x="13" y="19" width="4" height="4" rx="0.6" fill="white" opacity="0.75"/>
      <rect x="19" y="19" width="4" height="4" rx="0.6" fill="white"/>
      <line x1="17" y1="15" x2="19" y2="15" stroke="white" strokeWidth="0.8"/>
      <line x1="15" y1="17" x2="15" y2="19" stroke="white" strokeWidth="0.8"/>
      <line x1="21" y1="17" x2="21" y2="19" stroke="white" strokeWidth="0.8"/>
      <line x1="17" y1="21" x2="19" y2="21" stroke="white" strokeWidth="0.8"/>
      <rect x="14" y="6" width="2" height="4" rx="0.5" fill="#0a0a0a"/>
      <rect x="20" y="6" width="2" height="4" rx="0.5" fill="#0a0a0a"/>
      <rect x="14" y="26" width="2" height="4" rx="0.5" fill="#0a0a0a"/>
      <rect x="20" y="26" width="2" height="4" rx="0.5" fill="#0a0a0a"/>
      <rect x="6" y="14" width="4" height="2" rx="0.5" fill="#0a0a0a"/>
      <rect x="6" y="20" width="4" height="2" rx="0.5" fill="#0a0a0a"/>
      <rect x="26" y="14" width="4" height="2" rx="0.5" fill="#0a0a0a"/>
      <rect x="26" y="20" width="4" height="2" rx="0.5" fill="#0a0a0a"/>
    </svg>
  );
}

export default function ContactPage() {
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [message, setMessage] = useState("");
  const [status,  setStatus]  = useState("idle"); // idle | loading | success | error
  const [errMsg,  setErrMsg]  = useState("");

  /* Inject scoped CSS once */
  useEffect(() => {
    const id = "sf-contact-styles";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setErrMsg("");

    try {
      const res = await fetch(`${API_BASE_URL}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `Server error ${res.status}`);
      }

      setStatus("success");
    } catch (err) {
      setErrMsg(err.message || "Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="sf-contact">
      {/* ── Nav ── */}
      <nav className="sf-nav">
        <Link to="/" className="logo-wrap">
          <LogoSvg size={34} />
          <span className="logo-text">SensorFlow</span>
        </Link>
        <ul className="nav-links">
          <li><Link to="/#features">Features</Link></li>
          <li><Link to="/#how-it-works">How it works</Link></li>
          <li><Link to="/contact" style={{ color: "#0a0a0a", fontWeight: 500 }}>Contact</Link></li>
          <li><Link to="/app" className="nav-cta">Try free →</Link></li>
        </ul>
      </nav>

      {/* ── Main ── */}
      <main className="page-body">
        <div className="contact-wrap">
          <div className="section-label">support</div>
          <h1>Get in touch.</h1>
          <p className="subtitle">
            Have a question, a feature request, or just want to say hello?<br />
            We read every message and reply within one business day.
          </p>

          {status === "success" ? (
            <div className="success-box">
              <div className="success-icon">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 11l5 5 9-9" />
                </svg>
              </div>
              <h2>Message sent!</h2>
              <p>
                Thanks, {name.split(" ")[0]}. We'll get back to you at <strong>{email}</strong> as soon as possible.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              {status === "error" && (
                <div className="error-banner">{errMsg}</div>
              )}

              <div className="form-group">
                <label htmlFor="cf-name">Your name</label>
                <input
                  id="cf-name"
                  type="text"
                  placeholder="Jane Smith"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="cf-email">Email address</label>
                <input
                  id="cf-email"
                  type="email"
                  placeholder="jane@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="form-group">
                <label htmlFor="cf-message">Message</label>
                <textarea
                  id="cf-message"
                  placeholder="Tell us what's on your mind…"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="submit-btn"
                disabled={status === "loading" || !name.trim() || !email.trim() || !message.trim()}
              >
                {status === "loading" ? (
                  "Sending…"
                ) : (
                  <>
                    Send message
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer>
        <div className="footer-left">
          <LogoSvg size={24} />
          <span className="footer-copy">© 2026 SensorFlow · Cambridge, MA</span>
        </div>
        <ul className="footer-links">
          <li><Link to="/">Home</Link></li>
          <li><Link to="/app">Launch app</Link></li>
          <li><Link to="/contact">Contact</Link></li>
        </ul>
      </footer>
    </div>
  );
}
