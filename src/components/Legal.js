import React from "react";
import { Link } from "react-router-dom";

// Shared palette (matches the rest of the site).
const INK = "#0a0a0a";
const SUB = "#4b4a44";
const MUTE = "#8a897f";
const LINE = "#ebeae5";
const TEAL = "#1D9E75";
const SYNE = "'Syne', sans-serif";
const MONO = "'DM Mono', monospace";

const UPDATED = "Last updated: July 2026";
const ENTITY = "EdgeForge LLC";

function LogoMark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-label="EdgeForge logo">
      <rect x="10" y="10" width="16" height="16" rx="2.5" fill={INK} />
      <rect x="13" y="13" width="4" height="4" rx=".6" fill="#fff" />
      <rect x="19" y="13" width="4" height="4" rx=".6" fill="#fff" opacity=".75" />
      <rect x="13" y="19" width="4" height="4" rx=".6" fill="#fff" opacity=".75" />
      <rect x="19" y="19" width="4" height="4" rx=".6" fill="#fff" />
    </svg>
  );
}

function LegalShell({ title, children }) {
  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", color: INK }}>
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "18px 28px", borderBottom: `1px solid ${LINE}`, maxWidth: 1080, margin: "0 auto" }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: INK }}>
          <LogoMark />
          <span style={{ fontFamily: SYNE, fontWeight: 700, letterSpacing: "-.02em", fontSize: 17 }}>EdgeForge</span>
        </Link>
        <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
          <Link to="/terms" style={{ color: SUB, textDecoration: "none", fontSize: 14 }}>Terms</Link>
          <Link to="/privacy" style={{ color: SUB, textDecoration: "none", fontSize: 14 }}>Privacy</Link>
          <Link to="/contact" style={{ color: SUB, textDecoration: "none", fontSize: 14 }}>Contact</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 96px" }}>
        <div style={{ fontFamily: MONO, color: TEAL, fontSize: 11, letterSpacing: ".12em", marginBottom: 12 }}>
          ● LEGAL
        </div>
        <h1 style={{ fontFamily: SYNE, fontWeight: 800, fontSize: 32, letterSpacing: "-.02em", margin: "0 0 8px" }}>{title}</h1>
        <div style={{ fontFamily: MONO, color: MUTE, fontSize: 12, marginBottom: 34 }}>{UPDATED}</div>
        <div style={{ fontSize: 15, lineHeight: 1.7, color: SUB }}>{children}</div>

        <div style={{ marginTop: 48, paddingTop: 22, borderTop: `1px solid ${LINE}`, fontSize: 13, color: MUTE }}>
          Questions? <Link to="/contact" style={{ color: INK }}>Contact us</Link>. See also our{" "}
          <Link to={title.startsWith("Terms") ? "/privacy" : "/terms"} style={{ color: INK }}>
            {title.startsWith("Terms") ? "Privacy Policy" : "Terms of Service"}
          </Link>.
        </div>
      </div>
    </div>
  );
}

const H = ({ children }) => (
  <h2 style={{ fontFamily: SYNE, fontWeight: 700, fontSize: 19, color: INK, margin: "34px 0 10px" }}>{children}</h2>
);
const P = ({ children }) => <p style={{ margin: "0 0 14px" }}>{children}</p>;
const LI = ({ children }) => <li style={{ margin: "0 0 8px" }}>{children}</li>;
const UL = ({ children }) => <ul style={{ margin: "0 0 14px", paddingLeft: 22 }}>{children}</ul>;

export function TermsOfService() {
  return (
    <LegalShell title="Terms of Service">
      <P>
        These Terms of Service (“Terms”) govern your access to and use of the EdgeForge model-optimization
        platform, website, and related services (collectively, the “Service”), operated by {ENTITY}{" "}
        (“EdgeForge,” “we,” “us”). By accessing or using the Service, you agree to be bound by these Terms.
        If you do not agree, do not use the Service.
      </P>

      <H>1. The Service</H>
      <P>
        EdgeForge helps you compress, quantize, and optimize machine-learning models for deployment on edge
        hardware, and provides analysis such as size, accuracy-retention, device-fit, and estimated latency.
        Optimization results, accuracy figures, device-fit checks, and latency values are provided for your
        evaluation and may be estimates. They are not a guarantee of performance in your production environment.
      </P>

      <H>2. Your models and data</H>
      <P>
        <b>You retain all right, title, and interest in the models, datasets, files, and other materials you
        upload or submit (“Your Content”).</b> We claim no ownership of Your Content. You grant EdgeForge a
        limited, non-exclusive license to host, process, and transform Your Content solely to provide the
        Service to you and, where you enable it, to obtain measurements from the third-party services described
        in our <Link to="/privacy" style={{ color: INK }}>Privacy Policy</Link>.
      </P>
      <P>You represent that you have the rights necessary to upload Your Content and to have it optimized.</P>

      <H>3. Acceptable use</H>
      <UL>
        <LI>Do not upload content you do not have the legal right to use, or that infringes any third party’s rights.</LI>
        <LI>Do not use the Service to build or deploy anything unlawful, or to violate export-control or sanctions laws.</LI>
        <LI>Do not attempt to reverse-engineer, disrupt, overload, or gain unauthorized access to the Service.</LI>
        <LI>Do not resell or provide the Service to third parties except as expressly permitted in writing.</LI>
      </UL>

      <H>4. No warranty; validate before you ship</H>
      <P>
        THE SERVICE AND ALL OUTPUTS ARE PROVIDED “AS IS” AND “AS AVAILABLE,” WITHOUT WARRANTIES OF ANY KIND,
        WHETHER EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
        NON-INFRINGEMENT. Model optimization is inherently approximate. <b>You are solely responsible for
        independently validating any optimized model — including its accuracy, safety, and behavior — before
        deploying it to production or to any device.</b> Do not rely on the Service as the sole safeguard for
        any safety-critical or high-risk application.
      </P>

      <H>5. Limitation of liability</H>
      <P>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, EDGEFORGE WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
        SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES, OR FOR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING
        OUT OF OR RELATING TO THE SERVICE OR ANY MODEL OPTIMIZED WITH IT, EVEN IF ADVISED OF THE POSSIBILITY.
        OUR TOTAL AGGREGATE LIABILITY FOR ANY CLAIM WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID US
        FOR THE SERVICE IN THE 12 MONTHS BEFORE THE CLAIM, OR (B) US $100.
      </P>

      <H>6. Indemnification</H>
      <P>
        You agree to indemnify and hold EdgeForge harmless from any claims, damages, and expenses arising from
        Your Content, your use of the Service, or your violation of these Terms or any law or third-party right.
      </P>

      <H>7. Our intellectual property</H>
      <P>
        The Service, including its software, models, interfaces, and content (excluding Your Content), is owned
        by EdgeForge and protected by intellectual-property laws. These Terms grant you no rights in the Service
        other than the limited right to use it in accordance with these Terms.
      </P>

      <H>8. Term and termination</H>
      <P>
        We may suspend or terminate your access at any time if you violate these Terms or to protect the Service.
        You may stop using the Service at any time. Sections that by their nature should survive termination
        (including Sections 2, 4, 5, 6, and 7) will survive.
      </P>

      <H>9. Changes</H>
      <P>
        We may update these Terms from time to time. Material changes will be reflected by the “Last updated”
        date above, and continued use of the Service after changes take effect constitutes acceptance.
      </P>

      <H>10. Governing law</H>
      <P>
        These Terms are governed by the laws of the Commonwealth of Massachusetts, without regard to its
        conflict-of-laws rules. The state and federal courts located in Massachusetts will have exclusive
        jurisdiction over any dispute, and you consent to their jurisdiction and venue.
      </P>

      <H>11. Contact</H>
      <P>
        Questions about these Terms can be sent through our <Link to="/contact" style={{ color: INK }}>contact page</Link>.
        {ENTITY} is located in Cambridge, Massachusetts, USA.
      </P>
    </LegalShell>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalShell title="Privacy Policy">
      <P>
        This Privacy Policy explains how {ENTITY} (“EdgeForge,” “we,” “us”) collects, uses, and protects
        information when you use the EdgeForge platform and website (the “Service”). We aim to collect only what
        we need to run the Service.
      </P>

      <H>Information we collect</H>
      <UL>
        <LI><b>Models and files you upload.</b> The ML models, datasets, and files you submit for optimization or analysis.</LI>
        <LI><b>Contact information.</b> If you email us or request a pilot, the name, email address, and message you provide.</LI>
        <LI><b>Usage data.</b> Basic technical and analytics data such as pages viewed, actions taken, browser type, and approximate location, used to operate and improve the Service.</LI>
        <LI><b>Local storage.</b> Your project configuration and progress are stored in your browser’s local storage on your device so your work persists between sessions.</LI>
      </UL>

      <H>How we use information</H>
      <UL>
        <LI>To provide the Service — process and optimize the models you upload and return results to you.</LI>
        <LI>To operate, secure, maintain, and improve the Service.</LI>
        <LI>To respond to your inquiries and provide support.</LI>
      </UL>

      <H>Your uploaded models</H>
      <P>
        We process the models and data you upload only to provide the Service to you. <b>We do not sell your
        models or data, and we do not use them to train models for other customers.</b> We retain uploaded
        files only as long as needed to perform the optimization and deliver results, and you may request
        deletion at any time.
      </P>

      <H>Third-party on-device benchmarking</H>
      <P>
        If you choose to measure real on-device latency, your model may be submitted to third-party
        device-cloud services (for example, Qualcomm® AI Hub) so they can run it on physical hardware and
        return timing results. This only happens when you initiate a measurement, and those services process
        the model under their own terms and privacy policies.
      </P>

      <H>Sharing</H>
      <P>
        We do not sell personal information. We share information only with service providers who help us run
        the Service (such as hosting, infrastructure, and analytics providers, and the benchmarking services
        described above), and when required by law or to protect our rights and users.
      </P>

      <H>Security</H>
      <P>
        We use reasonable technical and organizational measures to protect information. No method of
        transmission or storage is completely secure, and we cannot guarantee absolute security.
      </P>

      <H>Data retention</H>
      <P>
        We keep information only as long as necessary for the purposes described here or as required by law.
        Uploaded models and files are removed after processing or on your request.
      </P>

      <H>Your choices and rights</H>
      <P>
        Depending on your location, you may have rights to access, correct, or delete your personal
        information, or to object to certain processing. To make a request, contact us through the{" "}
        <Link to="/contact" style={{ color: INK }}>contact page</Link>. You can clear locally stored project
        data at any time from within your browser.
      </P>

      <H>International processing</H>
      <P>
        We operate from the United States, and information may be processed on servers located in the U.S. and
        by the third-party services described above. By using the Service you understand your information may be
        processed in the United States.
      </P>

      <H>Children</H>
      <P>The Service is not directed to children under 16, and we do not knowingly collect their information.</P>

      <H>Changes</H>
      <P>
        We may update this Policy from time to time. Material changes will be reflected by the “Last updated”
        date above.
      </P>

      <H>Contact</H>
      <P>
        For privacy questions, reach us through our <Link to="/contact" style={{ color: INK }}>contact page</Link>.
        {ENTITY} is located in Cambridge, Massachusetts, USA.
      </P>
    </LegalShell>
  );
}
