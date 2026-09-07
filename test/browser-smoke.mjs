// Offline browser integration test. Uses fictional in-memory data; no live
// government site or third-party API is contacted. Install Chromium with
// `npx playwright install --with-deps chromium` before running.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import server from "../catalog/server.js";
import demo from "../catalog/demo.js";

const snapshot = demo.demoCatalogue();
snapshot.records[0].title.en =
  'Student learning <img src=x onerror="window.injected=true">';
snapshot.records[0].summary.en =
  "<script>window.injected=true</script> Fictional learning support.";
snapshot.directory = {
  domains: ["fixture.gov.in", "fixture.nic.in"],
  sourceUrl: null,
  importedAt: new Date().toISOString(),
  revision: null,
  license: null,
  notice: "Authored demo hostnames, not actual directory data.",
};
const app = server.createServer({ catalogue: snapshot });
await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${app.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE_PATH
      ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  const origins = new Set();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => origins.add(new URL(request.url()).origin));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector(".opportunity-card");
  assert.equal(await page.locator(".opportunity-card").count(), 6);
  assert.match(await page.locator("#notice").textContent(), /fictional/);
  assert.equal(await page.locator(".opportunity-card img").count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.deepEqual(Array.from(origins), [base]);

  await page.locator("#search").fill("Student learning");
  await page.waitForFunction(
    () => document.querySelectorAll(".opportunity-card").length === 1
  );
  await page.locator(".save-button").click();
  assert.equal(await page.locator("#saved-count").textContent(), "1");
  await page.locator(".details-button").click();
  await page.waitForSelector(".licence-note");
  assert.match(await page.locator("#detail-title").textContent(), /<img/);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await page.keyboard.press("Escape");

  await page.locator("button[data-view=saved]").click();
  await page.waitForSelector(".opportunity-card");
  assert.equal(await page.locator(".opportunity-card").count(), 1);
  await page.locator("#language-toggle").click();
  await page.waitForFunction(() =>
    document.querySelector(".card-title")?.textContent.includes("छात्र")
  );
  assert.equal(await page.locator("html").getAttribute("lang"), "hi");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("#saved-count").textContent(), "1");
  assert.equal(await page.locator("html").getAttribute("lang"), "hi");

  await page.locator("button[data-view=sources]").click();
  await page.waitForSelector(".data-table");
  await page.locator("#domain-search").fill("fixture.gov");
  await page.waitForFunction(() =>
    document
      .querySelector("#directory-results")
      ?.textContent.includes("1 matches")
  );
  assert.match(
    await page.locator("#directory-results").textContent(),
    /Not independently verified/
  );
  await page.locator("button[data-view=developers]").click();
  assert.equal(await page.locator(".endpoint").count(), 8);

  await page.locator("button[data-view=explore]").click();
  await page.waitForSelector(".opportunity-card");
  await page.locator("#filter-toggle").click();
  await page.locator("#persona-filter").selectOption("farmer");
  await page.waitForFunction(
    () =>
      document.querySelector("#results").getAttribute("aria-busy") === "false"
  );
  await page.locator("#clear-filters").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".opportunity-card").length === 6
  );
  await page.locator("#search").fill("no-such-opportunity");
  await page.waitForSelector(".empty-state");
  await page.locator("[data-action=clear]").click();
  await page.waitForSelector(".opportunity-card");

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth
    ),
    false
  );
  await page.locator("#menu-toggle").click();
  await page.locator("button[data-view=saved]").click();
  await page.waitForSelector(".opportunity-card");
  assert.equal(
    await page.locator("#menu-toggle").getAttribute("aria-expanded"),
    "false"
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser smoke passed: bilingual search, XSS escaping, bookmarks, details, filters, directory, API links and mobile navigation."
  );
} finally {
  if (browser) await browser.close();
  app.closeAllConnections();
  await new Promise((resolve) => app.close(resolve));
}
