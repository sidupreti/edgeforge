import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSignIn } from "@clerk/clerk-react";
import AuthShell from "./AuthShell";
import { inputStyle, labelStyle, primaryBtn, googleBtn, RED, MUTE, LINE } from "./authStyles";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 009 18z"/>
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 013.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 000 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 00.96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>
  );
}

export default function SignInPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  // "" | "second_factor" | "first_factor" — which email-code step we're in, if any.
  const [codeStage, setCodeStage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function finish(result) {
    if (result.status === "complete") {
      await setActive({ session: result.createdSessionId });
      navigate("/app");
      return true;
    }
    return false;
  }

  async function handleGoogle() {
    if (!isLoaded) return;
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/app",
      });
    } catch (e) {
      setError(e?.errors?.[0]?.longMessage || "Couldn't start Google sign-in.");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isLoaded) return;
    setError(""); setBusy(true);
    try {
      const result = await signIn.create({ identifier: email, password });
      if (!(await finish(result))) {
        // Instance may require an emailed code as a second factor (or as the first).
        if (result.status === "needs_second_factor") {
          await signIn.prepareSecondFactor({ strategy: "email_code" });
          setCodeStage("second_factor");
        } else if (result.status === "needs_first_factor") {
          const ff = (result.supportedFirstFactors || []).find((f) => f.strategy === "email_code");
          if (ff) {
            await signIn.prepareFirstFactor({ strategy: "email_code", emailAddressId: ff.emailAddressId });
            setCodeStage("first_factor");
          } else {
            setError("This account needs a different sign-in method.");
          }
        } else {
          setError("Sign-in incomplete — please try again.");
        }
      }
    } catch (e) {
      setError(e?.errors?.[0]?.longMessage || "Invalid email or password.");
    }
    setBusy(false);
  }

  async function handleCode(e) {
    e.preventDefault();
    if (!isLoaded) return;
    setError(""); setBusy(true);
    try {
      const result = codeStage === "second_factor"
        ? await signIn.attemptSecondFactor({ strategy: "email_code", code })
        : await signIn.attemptFirstFactor({ strategy: "email_code", code });
      if (!(await finish(result))) setError("Verification incomplete — check the code and try again.");
    } catch (e) {
      setError(e?.errors?.[0]?.longMessage || "Invalid code. Please try again.");
    }
    setBusy(false);
  }

  if (codeStage) {
    return (
      <AuthShell title="Check your email" subtitle={`We sent a 6-digit code to ${email}.`}>
        <form onSubmit={handleCode}>
          <label style={labelStyle}>Verification code</label>
          <input style={inputStyle} inputMode="numeric" autoFocus value={code}
            onChange={(e) => setCode(e.target.value)} placeholder="123456" />
          {error && <div style={{ color: RED, fontSize: 13, marginBottom: 14 }}>{error}</div>}
          <button style={primaryBtn} disabled={busy} type="submit">
            {busy ? "Verifying…" : "Verify & sign in"}
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Welcome back"
      footer={<>Don't have an account? <Link to="/sign-up" style={{ color: "#0a0a0a", fontWeight: 600 }}>Create one</Link></>}
    >
      <button style={googleBtn} onClick={handleGoogle} type="button">
        <GoogleIcon /> Continue with Google
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 18px", color: MUTE, fontSize: 12 }}>
        <div style={{ flex: 1, height: 1, background: LINE }} /> or <div style={{ flex: 1, height: 1, background: LINE }} />
      </div>
      <form onSubmit={handleSubmit}>
        <label style={labelStyle}>Email</label>
        <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label style={labelStyle}>Password</label>
        <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <div style={{ color: RED, fontSize: 13, marginBottom: 14 }}>{error}</div>}
        <button style={primaryBtn} disabled={busy} type="submit">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
