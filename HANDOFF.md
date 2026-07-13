# SensorFlow — Agent Handoff / Onboarding

Code-verified onboarding for a new agent. Every claim below was checked against the
actual source; file paths and anchors are real. Two repos are involved:

- **Frontend:** `/Users/sidupreti/edgeforge` (React CRA) — this file lives at its root.
- **Backend:** `/Users/sidupreti/edgeforge-api` (FastAPI).

> There is also a `CONTINUATION.md` at the frontend root (an older, narrower brief focused on
> the continuous-labeling refactor). This document supersedes it for onboarding.

---

## 1. Project overview

**SensorFlow** (prod: [sensor-flow.com](https://www.sensor-flow.com)) is an embedded-ML platform
for time-series sensor data — an **Edge Impulse alternative**. You ingest accelerometer/IMU-style
data, segment and label it, train a small classifier (or anomaly detector), validate it, and
export **C for microcontrollers**. It targets ESP32 / STM32 / nRF52 / RP2040 / Arduino-class MCUs.

**The 6-screen flow** (`src/App.js:20-25`, `STEPS`):

`Setup → Collect → Pipeline → Train → Validate → Export`

1. **Setup** — project name, target MCU, class names, **data mode** (samples vs continuous),
   collection method (upload vs live capture). Guided onboarding at `NewOnboarding.js`.
2. **Collect** — ingest data; segment + label it (continuous mode) or assign per-file classes
   + train/test pools (samples mode).
3. **Pipeline** — DSP + windowing config; **Spectral Features** sub-page + Generate Features.
4. **Train** — classifier (NN / Random Forest / Logistic) or anomaly detector; INT8 footprint.
5. **Validate** — held-out test accuracy + confusion matrix.
6. **Export** — interpreter-less lean C header (INT8 or float32); TFLite fallback path.

### Two data modes (set at Setup, never mixed) — `config.dataMode`
- **`samples`** — pre-labeled files, one file ≈ one class; **file-level** train/test split (pools).
- **`continuous`** — one long recording; you segment + label it in-app; **window-level** split.

The mode gates almost all UI/backend branching. **They must never share a data path.**

---

## 2. Architecture & structure

### Frontend — React 19, Create React App
Stack (`package.json`): `react` 19, `react-scripts` (CRA), `react-router-dom`,
`@hello-pangea/dnd` (drag/drop), `jszip`, `prismjs` + `react-simple-code-editor` (C preview),
`@playwright/test` (e2e). No TypeScript.

Screen → component map (`src/App.js` render switch, ~line 271–390):

| Screen | Component | File |
|--------|-----------|------|
| Setup / onboarding | `NewOnboarding`, `SetupScreen` | `src/components/NewOnboarding.js`, `SetupScreen.js` |
| Collect | `CollectScreen` (+ `LiveCaptureMode`, `SerialCaptureScreen`) | `src/components/CollectScreen.js` (~2700 lines) |
| Pipeline | `PipelineScreen`, `SpectralFeaturesScreen` | `src/components/PipelineScreen.js`, `SpectralFeaturesScreen.js` |
| Train | `TrainScreen` | `src/components/TrainScreen.js` |
| Validate | `ValidateScreen` | `src/components/ValidateScreen.js` |
| Export | `ExportScreen` | `src/components/ExportScreen.js` |
| Copilot (all screens) | `CopilotChat` | `src/components/CopilotChat.js` |
| Shell / nav | `Sidebar`, `App.js` | — |
| Marketing | `LandingPage`, `ContactPage` | routed via `react-router-dom` (`/`, `/app`, `/contact`) |

API base: `src/config.js` → `process.env.REACT_APP_API_URL || 'http://localhost:8000'`.

### Backend — FastAPI (Python 3.11)
Stack (`requirements.txt`): `fastapi` 0.135, `uvicorn` 0.44, `scikit-learn` 1.8, `numpy`, `scipy`,
`pandas`, **`ruptures` 1.1.9** (PELT segmentation), **`anthropic` 0.96** (Copilot), `SQLAlchemy`
2.0, `pydantic` 2, **`pyarrow`** (Parquet), `matplotlib`, `opencv-python-headless`, `python-multipart`.

Key modules (`/Users/sidupreti/edgeforge-api/`):

| Module | Role |
|--------|------|
| `main.py` (~6000 lines) | all HTTP routes, DSP feature extraction, training, C codegen, Copilot |
| `quantization.py` | INT8 post-training quantization + int8 C codegen (NN path) |
| `dsp.py`, `signal_processing.py`, `windowing.py` | filters, FFT, windowing |
| `trainer.py`, `classification_helpers.py` | (legacy) grouped CV helper; classifier utils |
| `quality_checks.py` | upload quality gate (see §3) |
| `db.py`, `db_models.py`, `data_layer.py` | SQLAlchemy models + Parquet ingest |
| `operations.py`, `command_log.py`, `selector.py` | Copilot ops, undo log |
| `kfold_xsubj.py` | standalone leave-users-out k-fold eval script (not imported by `main`) |

**Communication:** REST/JSON over `API_BASE_URL`. **Data store:** SQLite in dev
(`sensorflow_index.db`), **Postgres in prod** via `DATABASE_URL` (`db.py:10`). Immutable
recordings stored as **Parquet** (`data/parquet/`); the DB holds the index + `segments_json`.

**⚠️ In-memory per-project stores** (`main.py` module globals, keyed by `project_id`):
`_feature_store` (feature matrices + config), `_features_model` (trained clf + scaler + encoder +
optional `quant`), `_anomaly_model`. These are **lost on restart and not shared across workers** —
so `/features/generate → train → quantize → test → export` must all hit the **same** backend
process. Locally the dev server runs with `--reload`, which clears them on any `.py` edit.

### Deploy
- **Backend → Railway** (`web-production-76e75.up.railway.app`): `git push origin main` →
  auto-deploy. Procfile: `web: uvicorn main:app --host 0.0.0.0 --port $PORT`.
- **Frontend → Vercel** (`sensor-flow.com`): `git push origin main` **and** `npx vercel --prod`.
  `.env.vercel.production` sets `REACT_APP_API_URL` to the Railway URL (compile-time baked in).
- **Deploy them together, backend first** — the frontend calls new endpoints
  (`/features/quantize`, `/export/*`, `/datasets/*/segments`) that must be live first.
- Current deployed HEADs: frontend `b8bb559`, backend `2f5ceeb`.

### Single sources of truth for important state
- **Segments (continuous labeling): ONE `segments` array.**
  - Frontend: `const [segments, setSegments] = useState([])` (`CollectScreen.js:334`); loaded via
    `GET /datasets/{id}/segments` (`:350`), saved debounced via `PUT` (`:366`, uses `segmentsRef`
    to avoid stale closures).
  - Backend: `Dataset.segments_json` TEXT column (`db_models.py:95`).
  - Segment shape: `{ start_ms, end_ms, label, source, confidence, embedding, cluster_id }`
    (`CollectScreen.js:333`).
  - The **segment bar, the editable segment table, and drag-to-label all read/write this one
    array.** The **old dual-state system** (`perSegLabels` map + `labels` span array + `segLabels`
    cluster map) was **deleted** — do not reintroduce it. (Verified: the only `segLabels` token left
    is a local variable in the class-sync effect at `CollectScreen.js:396`.)
- **Classes:** App-level `classes` state (`App.js:116`), synced from segment labels via a
  **union** effect in `CollectScreen.js:~394` (append new labels, never replace — see §5).
- **Model / features:** backend `_features_model[project_id]` / `_feature_store[project_id]`.

---

## 3. What currently works (verified in code)

### Data ingestion
- **CSV upload** — `POST /upload-events` (`main.py:678`). Accepts **N channels**
  (`timestamp,v1,v2,…`; header or headerless), infers per-file **sample rate** and **timestamp
  units** (µs/ms/s) in `_parse_csv_flexible`. Frontend preview parser
  `CollectScreen.js:~65` (`_inferTimestampToUs`) mirrors this. **Working.**
- **Live serial capture (Web Serial)** — `SerialCaptureScreen.js` is a **full implementation**
  (not a stub): `"serial" in navigator` probe (`:6`), `navigator.serial.requestPort()` +
  `open({baudRate:115200})` (`:37`), `TextDecoderStream` read loop parsing CSV lines (`:69-98`),
  builds a CSV and POSTs `/upload-events` on stop (`:128`). **Chrome/Edge only** (graceful fallback
  UI at `:184`). `LiveCaptureMode.js` is the CollectScreen wrapper (`CollectScreen.js:2528`); the
  concrete `navigator.serial` calls live only in `SerialCaptureScreen.js`. **Working.**

### Continuous-recording mode
- **Classless recordings** — in continuous mode the file card shows "Recording" (no per-file class
  dropdown / pool buttons; those are samples-mode only, gated by `dataMode !== "continuous"`).
- **Auto-segmentation** — `POST /datasets/{id}/segment` → `auto_segment` (`main.py:4288`):
  **ruptures PELT** (`rpt.Pelt(model="l2", min_size=2)`, `:4333`) over per-window feature vectors.
  **Sensitivity → penalty:** `penalty = sensitivity * n_feature_dims` (`:4332`); default
  `sensitivity=1.0`, **higher = fewer segments**. Then **KMeans clustering** assigns each segment a
  `cluster_id` (`_KMeans`, `:4365`; auto-k when `n_clusters=0`). Each segment carries a mean-feature
  `embedding` (`:4345`). **Working** (caveats in §4).
- **Segment BAR + editable segment TABLE** — relabel / resize / delete / merge, all mutating the
  single `segments` array with **functional updaters** (`CollectScreen.js:437,448,468`). Color-by-
  label via a label→color map. **Working.**

### Labeling
- **Drag-to-label** on the signal + **typed time-range labels** — both write to `segments`.
- **Label propagation** — `POST /datasets/propagate-labels` → `propagate_labels` (`main.py:4440`):
  **sklearn `LabelSpreading(kernel="rbf", gamma=20, max_iter=100)`** (`:4478`) over
  StandardScaler-scaled **per-segment embeddings**; unlabeled = `-1`; returns
  `{segment_index, predicted_label, confidence}` where `confidence = max(label_distributions_)`
  (`:4491`). **Note:** the backend returns confidence only — the `"source":"propagated"` marker and
  low-confidence flagging are applied **frontend-side**. **Working** (caveat in §4).

### Feature extraction / training / validation / export
- **Feature generation** — `POST /features/generate` (`main.py:4945`): Butterworth filter + framed
  FFT power + stats; window/stride windowing; per-window labels from segments (continuous) or
  per-file labels (samples). **Working.**
- **Training** — `POST /features/train` (`main.py:5516`): **MLP** (default, `hidden=(20,10)`,
  relu, adam), **Random Forest**, or **Logistic Regression** (sklearn). Stored in
  `_features_model`. `POST /features/test` (`:5715`) → accuracy, confusion matrix, per-class F1.
  **Working.**
- **Anomaly detector** — `/features/anomaly/{suggest-axes,train,test}` (`main.py:5803/5832/5936`):
  **KMeans edge-distance novelty** — fit KMeans on "normal"-class features, per-cluster 95th-pct
  radius, score = `nearest_dist − radius` (negative = normal). **Working.**
- **INT8 quantization** — `POST /features/quantize` (`main.py:5653`) + `quantization.py`: symmetric
  per-tensor int8 (int8 weights, int32 bias, calibrated activation scales) for the **NN path only**;
  reports before/after size, estimated latency, honest test-set accuracy delta. **Working**
  (validated: generated C compiles and matches the numpy simulator bit-for-bit).
- **C export** — `POST /export/c` (`main.py:2812`): **interpreter-less lean C** (only the ops the
  model uses: dense/relu/softmax/argmax) as a single self-contained `.h`, INT8 or float32. Op-
  coverage check auto-falls-back to `POST /export/tflite` (`:2855`) for uncovered ops; the TFLite
  path **honestly reports "requires TensorFlow (not available)"** rather than emitting a fake file.
  `POST /export/summary` feeds the Export UI. **Working.**

### Quality gate — `quality_checks.py`
`run_all_checks(df, channels, sample_rate_hz, expected_channels)` (`:19`) runs: non-finite
(NaN/Inf → **fail**), clipping (≥5 samples at rail → warn), flatline (≥10 identical → warn),
low-variance (std < 1e-8 → **fail**), timestamp gaps (≥3× median interval; >10 → fail), channel
presence (→ warn). `overall_status` → `pass|warn|fail`. Called during upload (`main.py:770`); a
**`fail` auto-quarantines** the recording. **Working.**

### Ask Copilot (LLM) — `/copilot/chat` + `CopilotChat.js`
Provider **Anthropic** (`main.py:24`, `anthropic==0.96.0`). Models: **`claude-sonnet-4-5`** for
chat + all tool loops; `claude-haiku-4-5-20251001` for the video-frame auto-label vision feature
(`:4784`). Requires `ANTHROPIC_API_KEY`. It is **agentic, not just Q&A**: it proposes/executes
actions via tool-calling — label proposals (`preview_label` → `pending_operation` → user confirm →
execute → undo via `/command-log/{id}/undo`), read-only data tools (query/stats/anomalies),
recording tools, and inline `[ACTION: set_model=…, add_feature=…]` directives parsed by
`_parse_actions`. Frontend renders a confirm-card before any mutation (`CopilotChat.js:96`).
**Working** (Beta-labeled in UI).

---

## 4. Known issues / in-progress

- **Auto-segment over-segments real/noisy data at default sensitivity.** On the 50-min real-WISDM
  slice, `sensitivity=1` produced ~31 segments (block boundaries preserved but split within blocks).
  Raise sensitivity (→ higher penalty → fewer segments) or merge in the table. PELT boundaries also
  land **~1 s late** (windowing artifact). Not a correctness bug; a tuning caveat.
- **walk-vs-jog is the dominant error mode.** Cross-subject (leave-users-out 5-fold) held-out
  accuracy is **84.1% ± 9.3%**; per-class F1 mean: sitting 94.7, standing 95.2, **jogging 76.0,
  walking 70.7**. Walking↔jogging confusion is **consistent** across folds (both are motion classes;
  gait is subject-specific). One fold collapsed to ~40 F1 on walk/jog — expected variance, flagged,
  not smoothed.
- **sit / stand / lie propagation confusion (feature limitation).** The DSP high-pass filter
  (default 2 Hz) removes the DC/orientation that distinguishes low-motion postures, so their
  **segment embeddings look similar** → `LabelSpreading` can mislabel sitting↔standing↔laying.
  Mitigation used in practice: label each low-motion block directly (or verify propagation against a
  truth file) rather than trusting propagation for these. (Note: the *trained window classifier*
  separates sit/stand well — ~95% F1 — because it sees full feature vectors; the weakness is
  specifically **embedding-based propagation** for postural classes, which HAPT's `laying`
  compounds.)
- **drag-to-label ↔ segment-table sync: resolved.** They now share the single `segments` array, so
  edits from either surface stay consistent by construction. Keep it that way (see §5).
- **Legacy endpoints still present.** `/train`, `/classify`, `/export/c/{id}` (GET),
  `/export/python`, `/export/efp` use a separate global `_saved_pipeline`, unrelated to the current
  `/features/*` pipeline. Treat them as **dead/legacy**; the live pipeline is `/features/*` +
  `POST /export/c`.
- **UI polish:** most earlier flags were fixed (ms/µs upload preview, samples-mode controls leaking
  into continuous mode, dropzone copy, a hardcoded "99 features" estimate, an always-empty
  "Uncertain" confusion column, a "why is accuracy low?" guidance banner). Latency in the footprint
  panel is a **clearly-labeled estimate** (MACs × cycles/MAC), not measured on-device. `README.md`
  is still default CRA boilerplate.

---

## 5. Recurring bug patterns (avoid these)

1. **Stale-closure state bugs → use functional `setState` updaters.** Segment mutations use
   `setSegments(prev => …)` (`CollectScreen.js:437+`); the debounced save reads `segmentsRef.current`
   (`:357`), not the closed-over `segments`. A real bug this caused: the class-sync effect once did
   `setClasses(replace)` and **collapsed the class list to one entry** the moment you labeled a
   segment — the fix was a **union** updater (`setClasses(prev => [...prev, ...missing])`).
2. **Two-systems-not-sharing-one-source-of-truth.** The deleted `perSegLabels`/`labels`/`segLabels`
   trio caused desyncs between the bar, table, and drag. **All labeling surfaces must read/write the
   one `segments` array**, and the backend's `segments_json` is its persistence. Don't add a parallel
   label store.
3. **Entry-routing / prop-threading changes break Collect & Export.** The onboarding gate is
   `activeStep===0 && !config.projectName` (`App.js:380`); `dataMode` gates continuous vs samples
   throughout Collect; export precision/preset is threaded App → TrainScreen → ExportScreen. Changing
   routing or dropping a prop has repeatedly broken Collect (samples UI leaking into continuous) or
   Export (stale precision). Re-drive both flows after any such change.
4. **"Self-verify" claiming PASS without real testing.** HARD RULE: verify by **driving the real UI
   (Playwright)**, **compiling the generated C**, or **running `npm run e2e`** — never by calling a
   function/curling an endpoint and asserting the UI shows X. A concrete miss: the upload preview
   *looked* fine but showed "20000 Hz / 170 ms" for a 20 Hz file (ms read as µs). The committed e2e
   is the guardrail — keep it green.

---

## 6. Test assets & truth tables (verified to exist)

**Committed, reproducible (in-repo):**
- `e2e/fixtures/wisdm_continuous_large.csv` — 60k real WISDM samples, 4 blocks
  (Sitting/Jogging/Standing/Walking), `timestamp,acc_x,acc_y,acc_z`, 20 Hz. Drives the continuous e2e.
- `e2e/fixtures/xsubj/{walking,jogging,sitting,standing}_{train,test}.csv` + `manifest.json` —
  user-disjoint cross-subject split. Drives the cross-subject e2e.
- `public/sample_data.csv`, `public/sample-data/{metal,wood,plastic}_tap.csv` — the in-app
  "Download sample data" demo (samples mode).

**Working assets (NOT in-repo — on disk):**
- `~/Desktop/wisdm_continuous.csv` (83 KB, 20 Hz, 3200 samples, 160 s; `timestamp,acc_x,acc_y,acc_z`).
  Truth: `~/Downloads/wisdm_out/wisdm_continuous_truth.txt` (8 blocks, boundaries 20/40/…/140 s).
- `~/Downloads/hapt_csv/hapt_exp01.csv` (1.3 MB, 50 Hz; `timestamp,acc_x,acc_y,acc_z,gyro_x,gyro_y,gyro_z`).
  Truth: `~/Downloads/hapt_csv/hapt_exp01_truth.txt` (STANDING/SITTING/LAYING/WALKING/…STAIRS with
  sample+ms boundaries).
- `~/Downloads/activity_demo.csv` (312 KB; `timestamp,acc_x,acc_y,acc_z`; **no truth file**).

**Converter scripts (Downloads):**
- `wisdm_to_csv.py` — `WISDM_ar_v1.1_raw.txt` → `wisdm_continuous.csv` + `_truth.txt`.
- `hapt_to_csv.py` — UCI HAPT `RawData/` → `hapt_expNN.csv` + `_truth.txt`.
- Raw sources present: `~/Downloads/WISDM_ar_v1.1_raw.txt`, `~/Downloads/WISDM_ar_v1.1/`.

**How to validate segmentation / propagation with these:** upload a continuous CSV → Auto-segment →
compare detected boundaries to the `*_truth.txt` (expect ~1 s late) → label one block per class →
Propagate → check propagated labels match the truth blocks. Low-motion classes (sit/stand/lie) are
where propagation is least reliable — that's the intended stress test.

---

## 7. Run & test locally

**Backend** (`/Users/sidupreti/edgeforge-api`, Python 3.11, `venv/` present):
```bash
cd /Users/sidupreti/edgeforge-api
./venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000   # --reload clears in-memory stores on edit
# (set ANTHROPIC_API_KEY for Copilot; DATABASE_URL optional — defaults to sqlite)
```

**Frontend** (`/Users/sidupreti/edgeforge`):
```bash
cd /Users/sidupreti/edgeforge
npm start            # http://localhost:3000  (app at /app; defaults REACT_APP_API_URL=http://localhost:8000)
```

**End-to-end continuous flow (manual):** open `localhost:3000/app` → onboarding: name it, pick an
MCU, **Continuous recording**, **Upload CSV** → upload `wisdm_continuous.csv` → click the recording
→ **Auto-segment** → label one segment per class in the table → **Propagate labels** → **Next** →
**Pipeline** → open **Spectral Features** → **Generate Features** → **Train** (Start Training; then
**Quantize & measure INT8** in the footprint panel) → **Validate** (Classify Test Set) → **Export**
(lean C, INT8/float32; TFLite shows the honest fallback).

**Automated e2e** (real browser via system Chrome, needs both servers up):
```bash
cd /Users/sidupreti/edgeforge
npm run e2e          # playwright test — 2 specs: continuous-flow + cross-subject
```
Specs: `e2e/continuous-flow.spec.js` (onboarding → upload → segment → label → pipeline → generate →
train → INT8 footprint → validate → export both paths) and `e2e/cross-subject.spec.js` (samples
mode, user-disjoint pools via the UI). Config: `playwright.config.js` (reuses running dev servers).
Screenshots land in `e2e/screenshots/` (gitignored).

**Cross-subject / k-fold script** (backend, drives the real endpoints for pipeline parity):
```bash
cd /Users/sidupreti/edgeforge-api && ./venv/bin/python kfold_xsubj.py
```
