// Real end-to-end test of the continuous-mode pipeline.
//
// Drives the actual browser UI (no function calls): onboarding -> upload the
// large real WISDM slice -> auto-segment -> label every segment -> Pipeline ->
// Generate Features -> Train -> Validate, asserting on rendered state at each
// stage. Needs the CRA dev server (:3000) and FastAPI backend (:8000); the
// Playwright config starts/reuses both.
const { test, expect } = require("@playwright/test");
const path = require("path");

const FIXTURE = path.join(__dirname, "fixtures", "wisdm_continuous_large.csv");
const SHOTS = path.join(__dirname, "screenshots");

// Ground-truth activity blocks in the fixture (seconds). Used to label each
// auto-detected segment by the block its midpoint falls in — deterministic.
function labelForMidpointSec(mid) {
  if (mid < 750) return "sitting";
  if (mid < 1500) return "jogging";
  if (mid < 2250) return "standing";
  return "walking";
}

test("continuous WISDM flow: onboarding -> validate (>80% held-out)", async ({ page }) => {
  test.setTimeout(360_000);

  await test.step("reset to a clean project", async () => {
    await page.goto("/app");
    await page.evaluate(() => localStorage.removeItem("sensorflow_state"));
    await page.reload();
    await expect(page.getByPlaceholder("e.g. CNC Vibration Monitor")).toBeVisible();
  });

  await test.step("onboarding (continuous, upload CSV, 4 classes)", async () => {
    await page.getByPlaceholder("e.g. CNC Vibration Monitor").fill("WISDM E2E");
    await page.getByPlaceholder("e.g. idle, tap, shake").fill("Walking, Jogging, Sitting, Standing");
    await page.getByRole("button", { name: "ESP32-S3" }).click();
    await page.getByRole("button", { name: /Continuous recording/ }).click();
    await page.getByRole("button", { name: /Upload CSV/ }).click();
    await page.screenshot({ path: path.join(SHOTS, "flow-01-onboarding.png") });
    await page.getByRole("button", { name: /Let's go/ }).click();
  });

  await test.step("upload the real WISDM slice", async () => {
    await expect(page.getByRole("heading", { name: "Collect" })).toBeVisible();
    await page.locator('input[type="file"]').first().setInputFiles(FIXTURE);
    // Preview should report a real recording (60k rows @ 20 Hz), not a misread.
    await expect(page.getByText(/60000 rows/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /Add 1 file to dataset/ }).click();
    // Adding a 60k-row recording parses + uploads to the backend — wait for it
    // to leave the staging area and appear in the dataset before opening it.
    await expect(page.getByRole("button", { name: /Processing files/ })).toBeHidden({ timeout: 120_000 });
    await expect(page.getByText("No events yet")).toBeHidden({ timeout: 120_000 });
    await page.screenshot({ path: path.join(SHOTS, "flow-02-uploaded.png") });
  });

  await test.step("open recording and auto-segment", async () => {
    await page.getByText("wisdm_continuous_large.csv").first().click();
    const autoSeg = page.getByRole("button", { name: "Auto-segment" });
    await expect(autoSeg).toBeVisible({ timeout: 30_000 });
    await autoSeg.click();
    await expect(page.getByText(/\d+ segments/)).toBeVisible({ timeout: 120_000 });
  });

  let nSegments = 0;
  const labelCounts = { sitting: 0, jogging: 0, standing: 0, walking: 0 };
  await test.step("label every segment by ground-truth block", async () => {
    for (let i = 1; ; i++) {
      const sel = page.locator(`select[aria-label="Segment ${i} label"]`);
      if ((await sel.count()) === 0) break;
      const start = parseFloat(await page.locator(`input[aria-label="Segment ${i} start"]`).inputValue());
      const end = parseFloat(await page.locator(`input[aria-label="Segment ${i} end"]`).inputValue());
      const lbl = labelForMidpointSec((start + end) / 2);
      await sel.selectOption(lbl);
      labelCounts[lbl]++;
      nSegments++;
    }
    expect(nSegments).toBeGreaterThan(3);
    // every class must be represented
    for (const c of Object.keys(labelCounts)) expect(labelCounts[c]).toBeGreaterThan(0);
    await expect(page.getByText(new RegExp(`${nSegments}/${nSegments} labeled`))).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, "flow-03-segments-labeled.png") });
    await page.waitForTimeout(1500); // let the debounced segment save flush to the backend
  });

  await test.step("go to Pipeline; classification shows the real classes", async () => {
    await page.getByRole("button", { name: /Next/ }).click();
    await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
    // Not "0 classes" / "Recording": the impulse output is the 4 real classes.
    await expect(page.getByText("4 classes")).toBeVisible();
    for (const c of ["walking", "jogging", "sitting", "standing"]) {
      await expect(page.getByText(c, { exact: true }).first()).toBeVisible();
    }
    await page.screenshot({ path: path.join(SHOTS, "flow-04-pipeline.png") });
  });

  await test.step("Generate Features; per-class train AND test > 0", async () => {
    await page.getByText("Butterworth filter + FFT power").click();
    await page.getByRole("button", { name: "Generate Features" }).click();
    await expect(page.getByText("Train Windows")).toBeVisible({ timeout: 180_000 });

    const stats = await page.evaluate(() => {
      const tile = (label) => {
        const el = [...document.querySelectorAll("p")].find((p) => p.textContent.trim() === label);
        return el?.parentElement.querySelector("p:not(:first-child)")?.textContent?.trim();
      };
      const perClass = {};
      const wpc = [...document.querySelectorAll("p")].find((p) => /Windows per Class/i.test(p.textContent));
      if (wpc) {
        const txt = wpc.parentElement.innerText;
        const re = /([a-z]+)\s+train:\s*(\d+)\s+test:\s*(\d+)/gi;
        let m;
        while ((m = re.exec(txt))) perClass[m[1]] = { train: +m[2], test: +m[3] };
      }
      return {
        trainWindows: parseInt(tile("Train Windows"), 10),
        testWindows: parseInt(tile("Test Windows"), 10),
        features: parseInt(tile("Features"), 10),
        perClass,
      };
    });
    console.log("Generate Features:", JSON.stringify(stats));
    expect(stats.testWindows).toBeGreaterThan(0);
    expect(stats.trainWindows).toBeGreaterThan(0);
    expect(stats.features).toBeGreaterThan(0);
    expect(Object.keys(stats.perClass).length).toBe(4);
    for (const c of ["walking", "jogging", "sitting", "standing"]) {
      expect(stats.perClass[c].train, `${c} train windows`).toBeGreaterThan(0);
      expect(stats.perClass[c].test, `${c} test windows`).toBeGreaterThan(0);
    }
    await page.evaluate(() => {
      const h = [...document.querySelectorAll("p")].find((p) => /Windows per Class/i.test(p.textContent));
      if (h) h.scrollIntoView({ block: "center" });
    });
    await page.screenshot({ path: path.join(SHOTS, "flow-05-generate-features.png") });
  });

  await test.step("Train", async () => {
    await page.getByRole("button", { name: /Go back/ }).click();
    await page.getByText(/Neural Network \(Dense/).click();
    await page.getByRole("button", { name: "Start Training" }).click();
    await expect(page.getByText("Validation Accuracy")).toBeVisible({ timeout: 180_000 });
    await page.screenshot({ path: path.join(SHOTS, "flow-06-train.png") });
  });

  await test.step("Validate: confusion matrix on real classes, accuracy > 0.80", async () => {
    await page.getByRole("button", { name: /Next/ }).click();
    await page.getByRole("button", { name: "Classify Test Set" }).click();
    await expect(page.getByText("Held-out Test Confusion Matrix")).toBeVisible({ timeout: 120_000 });

    const acc = await page.evaluate(() => {
      const el = [...document.querySelectorAll("p")].find((p) => p.textContent.trim() === "Test Accuracy");
      const v = el?.parentElement.querySelector("p:not(:first-child)")?.textContent || "";
      return parseInt(v, 10);
    });
    console.log("Held-out Test Accuracy:", acc + "%");
    expect(acc).toBeGreaterThan(80);

    // Confusion matrix headers are the real class names.
    const headers = (await page.locator("table th").allInnerTexts()).join(" ");
    for (const c of ["jogging", "sitting", "standing", "walking"]) {
      expect(headers).toContain(c);
    }
    await page.screenshot({ path: path.join(SHOTS, "flow-07-validate.png") });
  });
});
