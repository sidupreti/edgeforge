// Cross-subject (subject-held-out) e2e — built ENTIRELY through the UI.
//
// Samples mode: upload per-class train files + test files, then assign the test
// files to the test pool using the actual "→ Test" buttons (no backend shortcut).
// The user-disjoint split is a property of the committed fixtures (manifest.json);
// the UI drives class labels + pool assignment. Then Generate Features → Train →
// Validate, asserting disjoint users, per-class train AND test > 0, and a
// confusion matrix on the real class names.
const { test, expect } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const FX = path.join(__dirname, "fixtures", "xsubj");
const SHOTS = path.join(__dirname, "screenshots");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(FX, "manifest.json"), "utf8"));
const CLASSES = ["walking", "jogging", "sitting", "standing"];

test("cross-subject WISDM flow via UI: user-disjoint pools → validate", async ({ page }) => {
  test.setTimeout(360_000);

  await test.step("user split is disjoint (from committed fixtures)", async () => {
    const tr = new Set(MANIFEST.train_users), te = new Set(MANIFEST.test_users);
    const overlap = [...tr].filter((u) => te.has(u));
    console.log(`Disjoint split — train users: ${MANIFEST.train_users.length}, test users: ${MANIFEST.test_users.length}, overlap: ${overlap.length}`);
    expect(overlap).toHaveLength(0);           // no user in both
    expect(te.size).toBeGreaterThan(0);
    expect(tr.size).toBeGreaterThan(0);
  });

  await test.step("reset + onboarding (samples mode, 4 classes)", async () => {
    await page.goto("/app");
    await page.evaluate(() => localStorage.removeItem("sensorflow_state"));
    await page.reload();
    await expect(page.getByPlaceholder("e.g. CNC Vibration Monitor")).toBeVisible();
    await page.getByPlaceholder("e.g. CNC Vibration Monitor").fill("WISDM XSubj E2E");
    await page.getByPlaceholder("e.g. idle, tap, shake").fill("Walking, Jogging, Sitting, Standing");
    await page.getByRole("button", { name: "ESP32-S3" }).click();
    await page.getByRole("button", { name: /Pre-labeled samples/ }).click();
    await page.getByRole("button", { name: /Upload CSV/ }).click();
    await page.getByRole("button", { name: /Let's go/ }).click();
    await expect(page.getByRole("heading", { name: "Collect" })).toBeVisible();
  });

  await test.step("upload per-class train + test files via the class Upload buttons", async () => {
    for (let i = 0; i < CLASSES.length; i++) {
      const cls = CLASSES[i];
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.getByRole("button", { name: "Upload", exact: true }).nth(i).click(),
      ]);
      await chooser.setFiles([path.join(FX, `${cls}_train.csv`), path.join(FX, `${cls}_test.csv`)]);
      await expect(page.getByText(`${cls}_test.csv`).first()).toBeVisible({ timeout: 30_000 });
    }
    // Verify the UI assigned the correct class to each file (Upload-button order).
    const evs = await page.evaluate(() =>
      (JSON.parse(localStorage.getItem("sensorflow_state") || "{}").events || [])
        .map((e) => ({ f: e.filename, c: e.className })));
    for (const cls of CLASSES) {
      for (const pool of ["train", "test"]) {
        const ev = evs.find((e) => e.f === `${cls}_${pool}.csv`);
        expect(ev, `${cls}_${pool}.csv uploaded`).toBeTruthy();
        expect(ev.c, `${cls}_${pool}.csv labeled`).toBe(cls);
      }
    }
  });

  await test.step("assign test files to the test pool via the → Test buttons", async () => {
    for (const cls of CLASSES) {
      await page.getByRole("button", { name: `Move ${cls}_test.csv to test`, exact: true }).click();
      await page.waitForTimeout(400);  // backend pool PATCH + re-render
    }
    // The UI must now hold exactly the 4 train files in train, 4 test files in test.
    const pools = await page.evaluate(() => {
      const evs = JSON.parse(localStorage.getItem("sensorflow_state") || "{}").events || [];
      const by = { train: [], test: [] };
      evs.forEach((e) => by[e.pool || "train"].push(e.filename));
      return by;
    });
    console.log("Pools after UI assignment:", JSON.stringify(pools));
    expect(pools.train.sort()).toEqual(CLASSES.map((c) => `${c}_train.csv`).sort());
    expect(pools.test.sort()).toEqual(CLASSES.map((c) => `${c}_test.csv`).sort());
    await page.screenshot({ path: path.join(SHOTS, "xsubj-01-pools.png") });
  });

  await test.step("Generate Features — per-class train AND test > 0", async () => {
    await page.getByRole("button", { name: /Next/ }).click();
    await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
    await page.getByText("Butterworth filter + FFT power").click();
    await page.getByRole("button", { name: "Generate Features" }).click();
    await expect(page.getByText("Train Windows")).toBeVisible({ timeout: 180_000 });

    const stats = await page.evaluate(() => {
      const perClass = {};
      const wpc = [...document.querySelectorAll("p")].find((p) => /Windows per Class/i.test(p.textContent));
      if (wpc) {
        const re = /([a-z]+)\s+train:\s*(\d+)\s+test:\s*(\d+)/gi;
        let m; while ((m = re.exec(wpc.parentElement.innerText))) perClass[m[1]] = { train: +m[2], test: +m[3] };
      }
      const tile = (l) => { const el = [...document.querySelectorAll("p")].find((p) => p.textContent.trim() === l); return parseInt(el?.parentElement.querySelector("p:not(:first-child)")?.textContent, 10); };
      return { train: tile("Train Windows"), test: tile("Test Windows"), perClass };
    });
    console.log("Cross-subject Generate Features:", JSON.stringify(stats));
    expect(stats.test).toBeGreaterThan(0);
    expect(Object.keys(stats.perClass).length).toBe(4);
    for (const c of CLASSES) {
      expect(stats.perClass[c].train, `${c} train windows`).toBeGreaterThan(0);
      expect(stats.perClass[c].test, `${c} test windows`).toBeGreaterThan(0);
    }
  });

  await test.step("Train → Validate: confusion matrix on real class names", async () => {
    await page.getByRole("button", { name: /Go back/ }).click();
    await page.getByText(/Neural Network \(Dense/).click();
    await page.getByRole("button", { name: "Start Training" }).click();
    await expect(page.getByText("Validation Accuracy")).toBeVisible({ timeout: 180_000 });
    await page.getByRole("button", { name: /Next/ }).click();
    await page.getByRole("button", { name: "Classify Test Set" }).click();
    await expect(page.getByText("Held-out Test Confusion Matrix")).toBeVisible({ timeout: 120_000 });

    const acc = await page.evaluate(() => {
      const el = [...document.querySelectorAll("p")].find((p) => p.textContent.trim() === "Test Accuracy");
      return parseInt(el?.parentElement.querySelector("p:not(:first-child)")?.textContent || "", 10);
    });
    const headers = (await page.locator("table th").allInnerTexts()).join(" ");
    console.log("Cross-subject held-out accuracy:", acc + "%");
    for (const c of CLASSES) expect(headers).toContain(c);   // matrix on real class names
    expect(acc).toBeGreaterThanOrEqual(0);                   // renders a real number
    await page.screenshot({ path: path.join(SHOTS, "xsubj-02-validate.png") });
  });
});
