import { test, expect } from "@playwright/test";

const row = (page, text) => page.locator("#tree .row", { has: page.locator(".tag", { hasText: text }) }).first();
const snippet = (page, name) => page.locator("#palette button", { hasText: name }).first();
// Drop into the middle of a row (inside it), or its top/bottom edge (before/after).
const dropOn = async (page, source, target, where = "inside") => {
  const box = await target.boundingBox();
  const y = where === "before" ? 2 : where === "after" ? box.height - 2 : box.height / 2;
  await source.dragTo(target, { targetPosition: { x: Math.min(40, box.width / 2), y } });
};
const markup = (page) => page.evaluate(() => window.htmlbuilder.project.serialize());
const previewFrame = (page) => page.frame({ url: /about:srcdoc/ }) ?? page.frames()[1];

test.beforeEach(async ({ page }) => {
  await page.goto("/?project=./projects/forsnaken.html");
  await page.evaluate(() => window.htmlbuilder.ready);
  await expect(snippet(page, "Game board")).toBeVisible();
});

test("builds the snake game by drag and drop, and it runs in the preview", async ({ page }) => {
  await dropOn(page, snippet(page, "Screen"), page.locator("#tree"));
  await dropOn(page, snippet(page, "Game board"), row(page, "pixel-canvas"));
  for (const name of ["Snake (green)", "Wall (diagonal)", "Apples", "Clock"]) {
    await dropOn(page, snippet(page, name), row(page, "forsnaken-game"));
  }
  await dropOn(page, snippet(page, "Arrow keys for green"), row(page, "pixel-canvas"), "after");

  const html = await markup(page);
  // Explicit closing tags, nested as dropped, in the order dropped.
  expect(html).toMatch(/<pixel-canvas[^>]*>\s*<forsnaken-game[^>]*>\s*<forsnaken-snake[^>]*><\/forsnaken-snake>\s*<forsnaken-wall[^>]*><\/forsnaken-wall>\s*<forsnaken-apple[^>]*><\/forsnaken-apple>\s*<frame-timer[^>]*><\/frame-timer>\s*<\/forsnaken-game>\s*<\/pixel-canvas>\s*<hot-key/);

  // The preview runs it: the board is drawn through <pixel-canvas>, and the clock moves the snake.
  await expect.poll(async () => {
    const frame = previewFrame(page);
    return frame?.evaluate(() => {
      const screen = document.querySelector("pixel-canvas");
      const game = document.querySelector("forsnaken-game");
      return screen?.canvas?.width && game?.snakes?.[0]?.snake.head.x;
    }).catch(() => 0);
  }, { timeout: 15000 }).toBeGreaterThan(2);
  const drawn = await previewFrame(page).evaluate(() => {
    const canvas = document.querySelector("pixel-canvas").canvas;
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 150 && data[i + 1] < 50) colored++; // red apple pixels
    return { size: [canvas.width, canvas.height], colored };
  });
  expect(drawn.size).toEqual([800, 400]);
  expect(drawn.colored).toBeGreaterThan(1000);
  await page.screenshot({ path: "test-results/snake-built-in-editor.png" });
});

test("swapping brains in the editor: drop a greedy brain into a snake and it hunts apples", async ({ page }) => {
  await dropOn(page, snippet(page, "Game board"), page.locator("#tree"));
  for (const name of ["Snake (green)", "Apples", "Clock"]) await dropOn(page, snippet(page, name), row(page, "forsnaken-game"));
  await dropOn(page, snippet(page, "Brain: greedy"), row(page, "forsnaken-snake"));
  expect(await markup(page)).toMatch(/<forsnaken-snake[^>]*>\s*<snake-brain-greedy><\/snake-brain-greedy>\s*<\/forsnaken-snake>/);
  await expect.poll(() => previewFrame(page)?.evaluate(() => document.querySelector("forsnaken-snake")?.snake.length ?? 0).catch(() => 0), { timeout: 20000 }).toBeGreaterThan(2);
});

test("moving an element: drag a row before, after, or into another", async ({ page }) => {
  await dropOn(page, snippet(page, "Game board"), page.locator("#tree"));
  await dropOn(page, snippet(page, "Apples"), row(page, "forsnaken-game"));
  await dropOn(page, snippet(page, "Clock (24 fps)"), row(page, "forsnaken-game"));
  await dropOn(page, row(page, "frame-timer"), row(page, "forsnaken-apple"), "before");
  expect(await markup(page)).toMatch(/<frame-timer[^>]*><\/frame-timer>\s*<forsnaken-apple/);
  await dropOn(page, row(page, "frame-timer"), row(page, "forsnaken-game"), "after");
  expect(await markup(page)).toMatch(/<\/forsnaken-game>\s*<frame-timer/);
  // An element can't go inside itself.
  await dropOn(page, row(page, "forsnaken-game"), row(page, "forsnaken-apple"));
  expect(await markup(page)).toMatch(/<forsnaken-game[^>]*>\s*<forsnaken-apple/);
});

test("the inspector edits attributes, with typed fields from the manifest", async ({ page }) => {
  await snippet(page, "Clock (24 fps)").click(); // click adds inside the selection (or the page)
  await row(page, "frame-timer").click();
  const fps = page.locator("#inspector").getByLabel("fps", { exact: true });
  await expect(fps).toHaveAttribute("type", "number");
  await fps.fill("30");
  await fps.press("Enter");
  const paused = page.locator("#inspector").getByLabel("paused", { exact: true });
  await expect(paused).toHaveAttribute("type", "checkbox");
  await paused.check();
  expect(await markup(page)).toContain('<frame-timer fps="30" paused=""></frame-timer>');
  // Free-form attributes too.
  await page.locator("#inspector").getByLabel("Attribute name").last().fill("id");
  await page.locator("#inspector").getByLabel("Value of new attribute").fill("clock");
  await page.locator("#inspector").getByLabel("Value of new attribute").press("Enter");
  await expect.poll(() => markup(page)).toContain('id="clock"');
});

test("the outline is keyboard navigable", async ({ page }) => {
  for (const name of ["Game board", "Clock"]) await snippet(page, name).click();
  await row(page, "forsnaken-game").click();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('#tree [aria-selected="true"] > .row')).toContainText("frame-timer");
  await expect(page.locator('#tree [aria-selected="true"] > .row')).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.locator('#tree [aria-selected="true"] > .row')).toContainText("forsnaken-game");
});

test("undo and redo; delete and duplicate shortcuts", async ({ page }) => {
  await snippet(page, "Apples").click();
  await row(page, "forsnaken-apple").click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+d" : "Control+d");
  await expect(page.locator("#tree .row")).toHaveCount(2);
  await page.locator("#tree").focus();
  await page.keyboard.press("Delete");
  await expect(page.locator("#tree .row")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("#tree .row")).toHaveCount(2);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.locator("#tree .row")).toHaveCount(1);
});

test("the project is saved as you go, and Download is the same page", async ({ page }) => {
  await snippet(page, "Game board").click();
  const saved = await markup(page);
  const download = await page.locator("#download").getAttribute("href").then((href) => page.evaluate((href) => fetch(href).then((r) => r.text()), href));
  expect(download).toBe(saved);
  await page.goto("/");
  await page.evaluate(() => window.htmlbuilder.ready);
  expect(await markup(page)).toBe(saved);
});

test("the downloaded page runs on its own", async ({ page, context }) => {
  for (const name of ["Game board", "Clock"]) await snippet(page, name).click();
  await row(page, "forsnaken-game").click();
  await snippet(page, "Snake (green)").click();
  const html = await markup(page);
  const standalone = await context.newPage();
  await standalone.route("http://localhost:4830/exported.html", (route) => route.fulfill({ contentType: "text/html", body: html }));
  await standalone.goto("/exported.html");
  await expect.poll(() => standalone.evaluate(() => document.querySelector("forsnaken-game")?.snakes?.[0]?.snake.head.x ?? 0), { timeout: 15000 }).toBeGreaterThan(1);
});

test("text before and after an element's children", async ({ page }) => {
  await snippet(page, "Game board").click();
  await snippet(page, "Apples").click();
  await row(page, "forsnaken-game").click();
  await page.locator("#inspector").getByLabel("Before", { exact: true }).fill("Start");
  await page.locator("#inspector").getByLabel("After", { exact: true }).fill("End");
  await page.locator("#inspector").getByLabel("After", { exact: true }).press("Enter");
  await expect.poll(() => markup(page)).toMatch(/<forsnaken-game[^>]*>Start<forsnaken-apple[^>]*><\/forsnaken-apple>End<\/forsnaken-game>/);
});

test("the CSS panel lists the rules matching the selected element", async ({ page }) => {
  await snippet(page, "Game board").click();
  await page.getByRole("tab", { name: "CSS" }).click();
  await page.locator("#css").fill("forsnaken-game { outline: 1px solid red; }\np { color: blue; }");
  await row(page, "forsnaken-game").click();
  await page.getByRole("tab", { name: "CSS" }).click();
  await expect(page.locator("#matching-rules button")).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator("#matching-rules button")).toContainText("forsnaken-game");
  await page.locator("#matching-rules button").click();
  expect(await page.evaluate(() => { const css = document.getElementById("css"); return css.value.slice(css.selectionStart, css.selectionEnd); })).toBe("forsnaken-game { outline: 1px solid red; }");
});

test("snippets can be renamed, edited, and deleted", async ({ page }) => {
  await page.getByRole("tab", { name: "Snippets" }).click();
  const first = page.locator("#snippet-list li").first();
  await first.getByLabel("Name").fill("Big screen");
  await first.getByLabel("Name").press("Tab");
  await expect(snippet(page, "Big screen")).toBeVisible();
  const count = await page.locator("#snippet-list li").count();
  await page.locator("#snippet-list li").first().getByRole("button", { name: "Delete snippet" }).click();
  await expect(page.locator("#snippet-list li")).toHaveCount(count - 1);
  await expect(snippet(page, "Big screen")).toHaveCount(0);
});

test("a component from a URL: defined in the page and the export; local servers need same-origin", async ({ page, context }) => {
  await page.getByRole("tab", { name: "Libraries" }).click();
  await page.getByRole("button", { name: "Add component" }).click();
  const item = page.locator("#definition-list li").last();
  await item.getByLabel("Tag").fill("hello-element");
  await item.getByLabel("Module URL").fill("http://localhost:4830/test/fixtures/hello-element.mjs");
  await item.getByLabel("Export").fill("HelloElement");
  await item.getByLabel("Export").press("Tab");
  await snippet(page, "<hello-element>").click();
  const html = await markup(page);
  expect(html).toContain('customElements.define("hello-element", module["HelloElement"])');
  const greeting = () => previewFrame(page)?.evaluate(() => document.querySelector("hello-element")?.textContent ?? "").catch(() => "");
  // This test server sends no CORS headers: the sandboxed preview can't load it...
  await page.waitForTimeout(1500);
  expect(await greeting()).toBe("");
  // ...until the preview may use this page's origin.
  await page.locator("#same-origin").check();
  await expect.poll(greeting, { timeout: 10000 }).toBe("Hello, world!");
  expect(await markup(page)).toContain('<meta name="htmlbuilder-preview" content="same-origin">');
  // The downloaded page defines it too.
  const standalone = await context.newPage();
  await standalone.route("http://localhost:4830/exported.html", (route) => route.fulfill({ contentType: "text/html", body: html }));
  await standalone.goto("/exported.html");
  await expect.poll(() => standalone.evaluate(() => document.querySelector("hello-element")?.textContent)).toBe("Hello, world!");
});

