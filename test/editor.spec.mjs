import { test, expect } from "@playwright/test";

// An element's start tag (or its one line), and its end tag.
const row = (page, text) => page.locator("#tree .row:not(.end)", { has: page.locator(".tag", { hasText: text }) }).first();
const endRow = (page, text) => page.locator("#tree .row.end", { has: page.locator(".tag", { hasText: text }) }).first();
const snippet = (page, name) => page.locator("#palette button", { hasText: name }).first();
// Drop on a row's top or bottom edge, its middle, or its upper or lower half.
const dropOn = async (page, source, target, where = "inside") => {
  const box = await target.boundingBox();
  const y = { before: 2, after: box.height - 2, inside: box.height / 2, upper: box.height / 4, lower: (box.height * 3) / 4 }[where];
  await source.dragTo(target, { targetPosition: { x: Math.min(40, box.width / 2), y } });
};
// Drop as the last child: on the upper half of the end tag, or the middle of a one-line element.
const append = async (page, source, text) =>
  (await endRow(page, text).count()) ? dropOn(page, source, endRow(page, text), "upper") : dropOn(page, source, row(page, text));
const markup = (page) => page.evaluate(() => window.htmlbuilder.project.serialize());
const previewFrame = (page) => page.frame({ url: /about:srcdoc/ }) ?? page.frames()[1];

// forsnaken's own page for builders (johnhenry/forsnaken), pinned: an
// outside project, opened the way anyone's would be.
const FORSNAKEN = "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@7300b17a5c486b59b27800b67d48b0243fbd6289/builder.html";
const DOMKIT_PACKAGE = "https://cdn.jsdelivr.net/gh/johnhenry/domkit@86b39db7a6d2807efed30a77cb295e72e6289c94/";
const FORSNAKEN_PACKAGE = "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@7300b17a5c486b59b27800b67d48b0243fbd6289/";

// Most tests start from forsnaken's libraries and snippets, with an empty page.
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.startsWith("[blank]")) {
    await page.goto("/?project=./projects/blank.html");
    await page.evaluate(() => window.htmlbuilder.ready);
    return;
  }
  await page.goto("/");
  await page.evaluate(async (url) => {
    await window.htmlbuilder.ready;
    const text = await fetch(url).then((r) => r.text());
    await window.htmlbuilder.open(text.replace(/<body>[\s\S]*<\/body>/, "<body></body>"), { from: url });
  }, FORSNAKEN);
  await expect(snippet(page, "Game board")).toBeVisible();
});

test("builds the snake game by drag and drop, and it runs in the preview", async ({ page }) => {
  await dropOn(page, snippet(page, "Screen"), page.locator("#tree"));
  await dropOn(page, snippet(page, "Game board"), row(page, "pixel-canvas"));
  for (const name of ["Snake (green)", "Wall (diagonal)", "Apples", "Clock"]) {
    await append(page, snippet(page, name), "forsnaken-game");
  }

  const html = await markup(page);
  // Explicit closing tags, nested as dropped, in the order dropped.
  expect(html).toMatch(/<pixel-canvas[^>]*>\s*<forsnaken-game[^>]*>\s*<forsnaken-snake[^>]*>\s*<snake-brain-player[^>]*>\s*(<hot-key[^>]*><\/hot-key>\s*){4}<gamepad-input[^>]*><\/gamepad-input>\s*<\/snake-brain-player>\s*<\/forsnaken-snake>\s*<forsnaken-wall[^>]*><\/forsnaken-wall>\s*<forsnaken-apple[^>]*><\/forsnaken-apple>\s*<frame-timer[^>]*><\/frame-timer>\s*<\/forsnaken-game>\s*<\/pixel-canvas>/);
  // The snake's controls came inside its player brain: no ids to wire up.

  // The preview runs it: the board is drawn through <pixel-canvas>, and the clock moves the snake.
  await expect.poll(async () => {
    const frame = previewFrame(page);
    return frame?.evaluate(() => {
      const screen = document.querySelector("pixel-canvas");
      const game = document.querySelector("forsnaken-game");
      return screen?.canvas?.width && game?.snakes?.[0]?.snake.head.x;
    }).catch(() => 0);
  }, { timeout: 15000 }).toBeGreaterThan(2);
  // Drawn through <pixel-canvas>: 800×400, with the red apples on it (wait
  // for a frame that has them: pixel-canvas draws on its own schedule).
  const drawn = () =>
    previewFrame(page).evaluate(() => {
      const canvas = document.querySelector("pixel-canvas").canvas;
      const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] > 150 && data[i + 1] < 50) colored++; // red apple pixels
      return { size: [canvas.width, canvas.height], colored };
    });
  expect((await drawn()).size).toEqual([800, 400]);
  await expect.poll(async () => (await drawn()).colored, { timeout: 10000 }).toBeGreaterThan(1000);
  await page.screenshot({ path: "test-results/snake-built-in-editor.png" });
});

test("swapping brains in the editor: replace the player's brain with a greedy one and it hunts apples", async ({ page }) => {
  await dropOn(page, snippet(page, "Game board"), page.locator("#tree"));
  for (const name of ["Snake (green)", "Apples", "Clock"]) await append(page, snippet(page, name), "forsnaken-game");
  await row(page, "snake-brain-player").click();
  await page.keyboard.press("Delete");
  await append(page, snippet(page, "Brain: greedy"), "forsnaken-snake");
  expect(await markup(page)).toMatch(/<forsnaken-snake[^>]*>\s*<snake-brain-greedy><\/snake-brain-greedy>\s*<\/forsnaken-snake>/);
  await expect.poll(() => previewFrame(page)?.evaluate(() => document.querySelector("forsnaken-snake")?.snake.length ?? 0).catch(() => 0), { timeout: 20000 }).toBeGreaterThan(2);
});

test("moving an element: drag a row before, after, or into another", async ({ page }) => {
  await dropOn(page, snippet(page, "Game board"), page.locator("#tree"));
  await append(page, snippet(page, "Apples"), "forsnaken-game");
  await append(page, snippet(page, "Clock (24 fps)"), "forsnaken-game");
  await dropOn(page, row(page, "frame-timer"), row(page, "forsnaken-apple"), "before");
  expect(await markup(page)).toMatch(/<frame-timer[^>]*><\/frame-timer>\s*<forsnaken-apple/);
  await dropOn(page, row(page, "frame-timer"), endRow(page, "forsnaken-game"), "after");
  expect(await markup(page)).toMatch(/<\/forsnaken-game>\s*<frame-timer/);
  // An element can't go inside itself.
  await dropOn(page, row(page, "forsnaken-game"), row(page, "forsnaken-apple"));
  expect(await markup(page)).toMatch(/<forsnaken-game[^>]*>\s*<forsnaken-apple/);
});

test("the outline reads as HTML: attributes in the start tag, end tags on their own line", async ({ page }) => {
  await dropOn(page, snippet(page, "Game board"), page.locator("#tree"));
  await append(page, snippet(page, "Clock (24 fps)"), "forsnaken-game");
  const lines = await page.locator("#tree .row").evaluateAll((rows) => rows.map((r) => r.querySelector(".tag")?.textContent ?? ""));
  expect(lines[0]).toMatch(/^<forsnaken-game( [\w-]+(="[^"]*")?)*>$/);
  expect(lines[1]).toBe('<frame-timer fps="24">');
  expect(lines.at(-1)).toBe("</forsnaken-game>");
  // The one-line element ends with its end tag; a void element has none.
  expect(await row(page, "frame-timer").locator(".tag").last().textContent()).toBe("</frame-timer>");
  await dropOn(page, page.locator("#palette button", { hasText: "<img>" }), endRow(page, "forsnaken-game"), "lower");
  await expect(row(page, "img").locator(".tag")).toHaveCount(1);
  await expect(row(page, "img").locator(".tag")).toHaveText(/^<img( [\w-]+(="[^"]*")?)*>$/);
});

test("drops follow the line between rows: start tag halves and end tag halves", async ({ page }) => {
  await dropOn(page, snippet(page, "Game board"), page.locator("#tree"));
  await append(page, snippet(page, "Apples"), "forsnaken-game");
  // Lower half of the start tag: the first child.
  await dropOn(page, snippet(page, "Clock (24 fps)"), row(page, "forsnaken-game"), "lower");
  expect(await markup(page)).toMatch(/<forsnaken-game[^>]*>\s*<frame-timer[^>]*><\/frame-timer>\s*<forsnaken-apple/);
  // Upper half of the end tag: the last child.
  await dropOn(page, row(page, "frame-timer"), endRow(page, "forsnaken-game"), "upper");
  expect(await markup(page)).toMatch(/<forsnaken-apple[^>]*>(.|\n)*<\/forsnaken-apple>\s*<frame-timer[^>]*><\/frame-timer>\s*<\/forsnaken-game>/);
  // Upper half of the start tag: before; lower half of the end tag: after.
  await dropOn(page, row(page, "frame-timer"), row(page, "forsnaken-game"), "upper");
  expect(await markup(page)).toMatch(/<frame-timer[^>]*><\/frame-timer>\s*<forsnaken-game/);
  await dropOn(page, row(page, "frame-timer"), endRow(page, "forsnaken-game"), "lower");
  expect(await markup(page)).toMatch(/<\/forsnaken-game>\s*<frame-timer/);
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
  await expect(page.locator('#tree [aria-selected="true"] > .row:not(.end)')).toContainText("frame-timer");
  await expect(page.locator('#tree [aria-selected="true"] > .row:not(.end)')).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.locator('#tree [aria-selected="true"] > .row:not(.end)')).toContainText("forsnaken-game");
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


test("a project opened from a URL keeps its relative URLs pointing there, and plays", async ({ page }) => {
  await page.goto(`/?project=${encodeURIComponent(FORSNAKEN)}`);
  await page.evaluate(() => window.htmlbuilder.ready);
  // forsnaken's page loads ./game/global.mjs and ./custom-elements.json: relative to forsnaken, not the editor.
  const html = await markup(page);
  expect(html).toContain(`<base href="${FORSNAKEN}">`);
  expect(html).toContain('<script type="module" src="./game/global.mjs" data-library="forsnaken">');
  await expect(row(page, "forsnaken-game")).toBeVisible();
  await expect.poll(() => previewFrame(page)?.evaluate(() => document.getElementById("green")?.snake.head.x ?? 0).catch(() => 0), { timeout: 20000 }).toBeGreaterThan(2);
  // Its manifest describes forsnaken's elements: typed fields.
  await row(page, 'id="green"').click();
  await expect(page.locator("#inspector").getByLabel("direction", { exact: true })).toHaveJSProperty("tagName", "SELECT");
});

test("[blank] libraries from packages: the palette fills from their manifests, and using an element loads its module", async ({ page }) => {
  await page.getByRole("tab", { name: "Libraries" }).click();
  for (const url of [DOMKIT_PACKAGE, FORSNAKEN_PACKAGE]) {
    await page.getByLabel("Add a library from a package").fill(url);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator("#package-status")).toHaveText(/^Added /);
  }
  await expect(page.locator("#palette h3", { hasText: /^domkit$/ })).toBeVisible();
  await expect(page.locator("#palette h3", { hasText: /^forsnaken$/ })).toBeVisible();
  // Nothing loads until it's used.
  expect(await markup(page)).not.toContain("<script");
  const add = (tag) => page.locator("#palette button", { hasText: new RegExp(`^<${tag}>$`) }).click();
  await add("forsnaken-game"); // added inside the selection (none: the page), then selected
  await add("frame-timer");
  await row(page, "forsnaken-game").click();
  await add("forsnaken-snake");
  await row(page, "forsnaken-game").click();
  await add("forsnaken-apple");
  const html = await markup(page);
  expect(html).toContain(`<script type="module" src="${FORSNAKEN_PACKAGE}game/global.mjs" data-library="forsnaken">`);
  expect(html).toContain(`<script type="module" src="${DOMKIT_PACKAGE}src/frame-timer/global.mjs" data-library="domkit">`);
  expect(html.match(/<script type="module"/g)).toHaveLength(2); // once per module, not per element
  await expect.poll(() => previewFrame(page)?.evaluate(() => document.querySelector("forsnaken-snake")?.snake.head.x ?? 0).catch(() => 0), { timeout: 20000 }).toBeGreaterThan(2);
});

test("[blank] a library with no manifest: its elements are listed, with the attributes they observe", async ({ page }) => {
  await page.getByRole("tab", { name: "Libraries" }).click();
  await page.locator("#same-origin").check(); // this test server sends no CORS headers
  await page.getByRole("button", { name: "Add library by hand" }).click();
  const item = page.locator("#library-list li").last();
  await item.getByLabel("Modules (one URL per line)").fill("/test/fixtures/greeting-card.mjs");
  await item.getByLabel("Modules (one URL per line)").press("Tab");
  const entry = page.locator("#palette button", { hasText: "<greeting-card>" });
  await expect(entry).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#palette h3", { hasText: "Defined in the page" })).toBeVisible();
  await entry.click();
  await row(page, "greeting-card").click();
  await page.getByRole("tab", { name: "Element" }).click();
  const greeting = page.locator("#inspector").getByLabel("greeting", { exact: true });
  await greeting.fill("Howdy");
  await greeting.press("Enter");
  await expect.poll(() => previewFrame(page)?.evaluate(() => document.querySelector("greeting-card")?.textContent).catch(() => "")).toBe("Howdy, world!");
});

test("New: a dialog to choose the title, the starting point, and libraries", async ({ page }) => {
  await snippet(page, "Game board").click();
  // Cancel leaves the page alone.
  await page.getByRole("button", { name: "New" }).click();
  const dialog = page.getByRole("dialog", { name: "New page" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, "forsnaken-game")).toBeVisible();

  // Keep this page's libraries and snippets, with nothing on it.
  await page.getByRole("button", { name: "New" }).click();
  await dialog.getByLabel("Title").fill("Snake, take two");
  await dialog.getByLabel(/libraries, snippets, and CSS/).check();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#tree .row")).toHaveCount(0);
  await expect(snippet(page, "Game board")).toBeVisible();
  await expect(page.locator("#title")).toHaveValue("Snake, take two");
  expect(await markup(page)).toContain(`<base href="${FORSNAKEN}">`);

  // An empty page with domkit (offered), and forsnaken (typed): remembered next time.
  await page.getByRole("button", { name: "New" }).click();
  await dialog.getByLabel(/^domkit/).check();
  await dialog.getByLabel(/Other packages/).fill(FORSNAKEN_PACKAGE);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden({ timeout: 15000 });
  await expect(page.locator("#palette h3", { hasText: /^domkit$/ })).toBeVisible();
  await expect(page.locator("#palette h3", { hasText: /^forsnaken$/ })).toBeVisible();
  await expect(snippet(page, "Game board")).toHaveCount(0);
  await expect(page.locator("#title")).toHaveValue("Untitled");
  await page.getByRole("button", { name: "New" }).click();
  await expect(dialog.getByLabel(/^forsnaken/)).not.toBeChecked();
  // A page at a URL keeps its own title.
  await dialog.getByLabel("Page URL").fill(FORSNAKEN);
  await expect(dialog.getByLabel("A page at a URL")).toBeChecked();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden({ timeout: 15000 });
  await expect(page.locator("#title")).toHaveValue("Forsnaken (build your own)");
  await expect(row(page, "forsnaken-game")).toBeVisible();
});

test("[blank] New offers forsnaken's page and library as starting points", async ({ page }) => {
  await page.getByRole("button", { name: "New" }).click();
  const dialog = page.getByRole("dialog", { name: "New page" });
  await expect(dialog.getByLabel(/^forsnaken/)).toBeVisible();
  await dialog.getByLabel(/^Forsnaken: the snake game/).check();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden({ timeout: 15000 });
  await expect(page.locator("#title")).toHaveValue("Forsnaken (build your own)");
  await expect(row(page, "forsnaken-game")).toBeVisible();
  await expect(snippet(page, "Game board")).toBeVisible();
  // Opening it again doesn't duplicate the suggestions.
  await page.getByRole("button", { name: "New" }).click();
  await expect(dialog.getByLabel(/^Forsnaken: the snake game/)).toHaveCount(1);
  // Or just its library, on an empty page.
  await dialog.getByLabel(/^forsnaken/).check();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden({ timeout: 15000 });
  await expect(page.locator("#tree .row")).toHaveCount(0);
  await expect(page.locator("#palette h3", { hasText: /^forsnaken$/ })).toBeVisible();
});

// --- the live preview: edits are patched into the running page ---------------

const LIVE_FORSNAKEN = "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@7300b17a5c486b59b27800b67d48b0243fbd6289/builder.html";
const openLive = async (page) => {
  await page.goto(`/?project=${encodeURIComponent(LIVE_FORSNAKEN)}`);
  await page.evaluate(() => window.htmlbuilder.ready);
  await expect.poll(() => game(page, () => document.getElementById("white")?.snake.length ?? 0), { timeout: 20000 }).toBeGreaterThan(3);
};
// Run `fn` in the preview; null if it isn't there (yet).
const game = (page, fn) => previewFrame(page)?.evaluate(fn).catch(() => null) ?? null;
const loadedAt = (page) => game(page, () => performance.timeOrigin);

test("swapping a brain mid-game: the game keeps running, the same snake under a new brain", async ({ page }) => {
  await openLive(page);
  const started = await loadedAt(page);
  const before = await game(page, () => document.getElementById("white").snake.length);
  // Delete white's greedy brain, then add a random one inside white.
  await row(page, "snake-brain-greedy").click();
  await page.keyboard.press("Delete");
  await row(page, 'id="white"').click();
  await snippet(page, "Brain: random").click();
  await expect.poll(() => game(page, () => document.querySelector("#white > snake-brain-random") !== null && !document.querySelector("snake-brain-greedy"))).toBe(true);
  expect(await loadedAt(page), "no reload").toBe(started);
  expect(await game(page, () => document.getElementById("white").snake.length)).toBeGreaterThanOrEqual(before);
  // Undo brings the greedy brain back, still without a reload.
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => game(page, () => document.querySelector("#white > snake-brain-greedy") !== null && !document.querySelector("snake-brain-random"))).toBe(true);
  expect(await loadedAt(page)).toBe(started);
});

test("attribute edits, moves, text, and CSS patch the running page; what components did to themselves stays", async ({ page }) => {
  await openLive(page);
  const started = await loadedAt(page);
  const head = await game(page, () => document.getElementById("white").snake.length);
  // An attribute, from the Element panel.
  await row(page, 'id="white"').click();
  const color = page.locator("#inspector").getByLabel("color", { exact: true });
  await color.fill("#ff00ff");
  await color.press("Enter");
  await expect.poll(() => game(page, () => document.getElementById("white").snake.color)).toBe("#ff00ff");
  expect(await game(page, () => document.getElementById("white").snake.length), "the snake carried on").toBeGreaterThanOrEqual(head);
  // A move: the clock goes after the apples, and keeps ticking.
  await dropOn(page, row(page, "frame-timer"), row(page, "forsnaken-apple"), "after");
  await expect.poll(() => game(page, () => document.querySelector("forsnaken-apple + forsnaken-snake, forsnaken-apple + frame-timer")?.localName)).toBe("frame-timer");
  // CSS.
  await page.getByRole("tab", { name: "CSS" }).click();
  await page.locator("#css").fill("body { background: rgb(1, 2, 3); }");
  await page.locator("#css").blur();
  await expect.poll(() => game(page, () => getComputedStyle(document.body).backgroundColor)).toBe("rgb(1, 2, 3)");
  // The game set role and aria-label on itself; patches leave them.
  expect(await game(page, () => document.querySelector("forsnaken-game").getAttribute("role"))).toBe("img");
  expect(await loadedAt(page), "no reload").toBe(started);
  const still = await game(page, () => document.getElementById("white").snake.length);
  await page.waitForTimeout(500);
  expect(await game(page, () => document.getElementById("green").snake.head.x)).not.toBe(10); // still moving
  expect(still).toBeGreaterThan(0);
});

test("libraries reload the preview, and so does Restart", async ({ page }) => {
  await openLive(page);
  let started = await loadedAt(page);
  await page.getByRole("button", { name: "Restart preview" }).click();
  await expect.poll(() => loadedAt(page)).not.toBe(started);
  started = await loadedAt(page);
  await page.getByRole("tab", { name: "Libraries" }).click();
  const item = page.locator("#library-list li").first();
  await item.getByLabel("Name").fill("domkit-renamed");
  await item.getByLabel("Name").press("Tab");
  await expect.poll(() => loadedAt(page)).not.toBe(started);
});

test("[blank] a component's own children survive patches to it", async ({ page }) => {
  await page.getByRole("tab", { name: "Libraries" }).click();
  await page.locator("#same-origin").check();
  await page.getByRole("button", { name: "Add library by hand" }).click();
  const item = page.locator("#library-list li").last();
  await item.getByLabel("Modules (one URL per line)").fill("/test/fixtures/greeting-card.mjs");
  await item.getByLabel("Modules (one URL per line)").press("Tab");
  await expect(page.locator("#palette button", { hasText: "<greeting-card>" })).toBeVisible({ timeout: 10000 });
  await page.locator("#palette button", { hasText: "<greeting-card>" }).click();
  await expect.poll(() => game(page, () => document.querySelector("greeting-card")?.textContent)).toBe("Hello, world!");
  const started = await loadedAt(page);
  // greeting-card writes its own text; editing its attribute patches it, and the text it wrote is its own.
  await row(page, "greeting-card").click();
  await page.getByRole("tab", { name: "Element" }).click();
  const name = page.locator("#inspector").getByLabel("name", { exact: true });
  await name.fill("Ada");
  await name.press("Enter");
  await expect.poll(() => game(page, () => document.querySelector("greeting-card")?.textContent)).toBe("Hello, Ada!");
  // Adding a sibling doesn't disturb it.
  await page.evaluate(() => window.htmlbuilder.select(null));
  await page.locator("#palette button", { hasText: /^<p>$/ }).click();
  await expect.poll(() => game(page, () => document.body.querySelectorAll("p").length)).toBe(1);
  expect(await game(page, () => document.querySelector("greeting-card")?.textContent)).toBe("Hello, Ada!");
  expect(await loadedAt(page), "no reload").toBe(started);
});

test("[blank] pixelable as a library: its effects in the palette, and using pixel-canvas loads just that module", async ({ page }) => {
  const PIXELABLE = "https://cdn.jsdelivr.net/gh/johnhenry/pixelable@73c544ab05ccedc3089dfee81a105f8539d5f944/";
  await page.getByRole("tab", { name: "Libraries" }).click();
  await page.getByLabel("Add a library from a package").fill(PIXELABLE);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator("#package-status")).toHaveText("Added pixelable.");
  for (const tag of ["pixel-canvas", "pixel-mosaic", "pixel-sprite"]) {
    await expect(page.locator("#palette button", { hasText: new RegExp(`^<${tag}>$`) })).toBeVisible();
  }
  await page.locator("#palette button", { hasText: /^<pixel-canvas>$/ }).click();
  await row(page, "pixel-canvas").click();
  await page.getByRole("tab", { name: "Element" }).click();
  // Typed from the manifest: effects is text, html a checkbox.
  await expect(page.locator("#inspector").getByLabel("html", { exact: true })).toHaveAttribute("type", "checkbox");
  const html = await markup(page);
  expect(html).toContain(`<script type="module" src="${PIXELABLE}src/pixel-canvas/global.mjs" data-library="pixelable">`);
  expect(html.match(/<script type="module"/g)).toHaveLength(1);
});
