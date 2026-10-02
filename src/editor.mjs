// The editor: one Project (project.mjs), and four views of it: palette,
// outline, inspector, and preview. Every edit goes through
// project.change(), which records undo and triggers a refresh.
import { Project } from "./project.mjs";
import { renderPalette } from "./palette.mjs";
import { renderOutline } from "./outline.mjs";
import { renderInspector, setTextAround } from "./inspector.mjs";
import { connectPreview } from "./preview.mjs";
import { describeAll, libraryFromPackage } from "./manifests.mjs";
import * as suggestions from "./suggestions.mjs";

const STORAGE_KEY = "htmlbuilder:project";
const $ = (id) => document.getElementById(id);

let project;
let selectedPath = null;
let loaded = false; // nothing is saved until a project has fully loaded
let paletteFilter = "";
let inspected = null;
let catalog = new Map(); // tag -> what the libraries' manifests say about it
const defined = new Map(); // tag -> observed attributes, as reported by the preview

const selected = () => (selectedPath ? project.nodeAt(selectedPath) : null);
const select = (element) => {
  selectedPath = element && project.body.contains(element) && element !== project.body ? project.pathOf(element) : null;
  refresh({ palette: false });
};

const preview = connectPreview(
  $("preview"),
  (path) => {
    const element = project.nodeAt(path);
    if (element) select(element);
  },
  (elements) => {
    const fresh = Object.keys(elements).filter((tag) => !defined.has(tag));
    for (const [tag, attributes] of Object.entries(elements)) defined.set(tag, attributes);
    // Only what this changes: the palette (elements no manifest describes)
    // and the panel for the selected element.
    if (fresh.some((tag) => !catalog.has(tag))) {
      renderPalette($("palette"), { project, catalog, defined, filter: paletteFilter, onAdd: add });
      if (fresh.includes(selected()?.localName)) refresh({ palette: false });
    }
  },
);

// What's known about a tag: its manifest entry, or else (for libraries
// without one) the attributes its class observes, from the preview.
const describe = (tag) =>
  catalog.get(tag) ??
  (defined.has(tag) ? { tag, summary: "", attributes: defined.get(tag).map((name) => ({ name, type: "string", description: "" })) } : undefined);

async function refresh({ palette = true, now = false } = {}) {
  const element = selected();
  renderOutline($("tree"), {
    project,
    selected: element,
    onSelect: select,
    onDrop: drop,
  });
  catalog = await describeAll(project.libraries, project.base || location.href);
  const info = element ? describe(element.localName) : undefined;
  // While someone's typing in the panel for the same element, leave it be
  // (its fields already show what they typed); re-render on a new selection.
  const typing = $("inspector").contains(document.activeElement) && document.activeElement.matches("input, textarea, select") && inspected === element;
  inspected = element;
  if (!typing) renderInspector($("inspector"), {
    element,
    info,
    onAttribute: (name, value, rename) =>
      edit(() => {
        if (rename && rename !== name) element.removeAttribute(rename);
        try {
          if (value === null) element.removeAttribute(name);
          else element.setAttribute(name, value);
        } catch {
          // not a valid attribute name
        }
        return element;
      }),
    onText: (text) => edit(() => ((element.textContent = text), element)),
    onTextAround: (before, after) => edit(() => (setTextAround(element, before, after), element)),
    onAction: (action) => run(action),
  });
  if (palette) renderPalette($("palette"), { project, catalog, defined, filter: paletteFilter, onAdd: add });
  // Never overwrite CSS that's been typed but not yet committed.
  if (!cssPending && document.activeElement !== $("css") && $("css").value !== project.css) $("css").value = project.css;
  if (document.activeElement !== $("title")) $("title").value = project.title;
  $("undo").disabled = !project.canUndo;
  $("redo").disabled = !project.canRedo;
  renderLibraries();
  renderSnippets();
  renderDefinitions();
  renderMatchingRules(element);
  $("same-origin").checked = project.previewSameOrigin;
  const html = project.serialize();
  const download = $("download");
  URL.revokeObjectURL(download.href);
  download.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  download.download = `${(project.title || "page").replace(/[^\w.-]+/g, "-").toLowerCase()}.html`;
  preview.show(project.serialize({ preview: true, selected: element }), { now, sameOrigin: project.previewSameOrigin });
  if (loaded) {
    try {
      localStorage.setItem(STORAGE_KEY, html);
    } catch {
      // storage full or blocked: the download still works
    }
  }
}

/** Make an edit; select what it returns. */
function edit(fn) {
  const result = project.change(fn);
  if (result && result.nodeType === Node.ELEMENT_NODE && project.body.contains(result)) selectedPath = project.pathOf(result);
  else if (selectedPath && !selected()) selectedPath = null;
  refresh({ palette: false });
  return result;
}

function add(html) {
  edit(() => {
    const nodes = project.fragment(html);
    loadDefinitions(nodes);
    return project.place(nodes, selected(), "inside");
  });
}

function drop({ html, path }, target, position) {
  edit(() => {
    const nodes = html ? project.fragment(html) : [project.nodeAt(path)].filter(Boolean);
    if (html) loadDefinitions(nodes);
    return project.place(nodes, target, position);
  });
}

// Make sure the page loads the module that registers each custom element
// in `nodes`, when a library's manifest says which one that is.
function loadDefinitions(nodes) {
  const base = project.base || location.href;
  const resolve = (url) => {
    try {
      return new URL(url, base).href;
    } catch {
      return url;
    }
  };
  for (const node of nodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    for (const element of [node, ...node.querySelectorAll("*")]) {
      const info = catalog.get(element.localName);
      const library = info?.definition && project.libraries.find((l) => l.name === info.library);
      if (library && !library.modules.some((m) => resolve(m) === info.definition)) library.modules.push(info.definition);
    }
  }
}

function run(action) {
  const element = selected();
  if (action === "undo") {
    project.undo();
    return refresh();
  }
  if (action === "redo") {
    project.redo();
    return refresh();
  }
  if (!element) return;
  if (action === "delete") {
    const next = element.nextElementSibling ?? element.previousElementSibling ?? (element.parentElement !== project.body ? element.parentElement : null);
    edit(() => {
      element.remove();
      return next;
    });
  } else if (action === "duplicate") {
    edit(() => project.place([element.cloneNode(true)], element, "after"));
  } else if (action === "snippet") {
    const name = prompt("Snippet name", element.id || element.localName);
    if (!name) return;
    project.change(() => {
      project.snippets = [...project.snippets.filter((s) => s.name !== name), { name, html: element.outerHTML }];
    });
    refresh();
  }
}

// --- libraries ---------------------------------------------------------------

function renderLibraries() {
  const list = $("library-list");
  if (list.contains(document.activeElement) && document.activeElement.matches("input, textarea")) return; // don't disturb typing
  list.replaceChildren(
    ...project.libraries.map((library, i) => {
      const item = document.createElement("li");
      item.innerHTML = `<label>Name <input name="name"></label>
        <label>Modules (one URL per line) <textarea name="modules" rows="3"></textarea></label>
        <label>Manifest URL <input name="manifest" placeholder="…/custom-elements.json"></label>
        <button type="button" name="remove">Remove library</button>`;
      item.querySelector("[name=name]").value = library.name;
      item.querySelector("[name=modules]").value = library.modules.join("\n");
      item.querySelector("[name=manifest]").value = library.manifest;
      item.onchange = () => {
        project.change(() => {
          project.libraries[i] = {
            name: item.querySelector("[name=name]").value.trim() || `library-${i + 1}`,
            modules: item.querySelector("[name=modules]").value.split("\n").map((s) => s.trim()).filter(Boolean),
            manifest: item.querySelector("[name=manifest]").value.trim(),
          };
        });
        refresh();
      };
      item.querySelector("[name=remove]").onclick = () => {
        project.change(() => project.libraries.splice(i, 1));
        refresh();
      };
      return item;
    }),
  );
}

// --- snippets, components from URLs, and CSS rules ----------------------------

// Rebuild a list from items, unless someone's typing in it.
function renderList(list, items, fill) {
  if (list.contains(document.activeElement) && document.activeElement.matches("input, textarea")) return;
  list.replaceChildren(...items.map((item, i) => fill(item, i)));
}

function renderSnippets() {
  renderList($("snippet-list"), project.snippets, (snippet, i) => {
    const item = document.createElement("li");
    item.innerHTML = `<label>Name <input name="name"></label>
      <label>Markup <textarea name="html" rows="4" spellcheck="false"></textarea></label>
      <button type="button" name="remove">Delete snippet</button>`;
    item.querySelector("[name=name]").value = snippet.name;
    item.querySelector("[name=html]").value = snippet.html;
    item.onchange = () => {
      project.change(() => {
        project.snippets[i] = { name: item.querySelector("[name=name]").value.trim() || snippet.name, html: item.querySelector("[name=html]").value.trim() };
      });
      refresh();
    };
    item.querySelector("[name=remove]").onclick = () => {
      project.change(() => project.snippets.splice(i, 1));
      refresh();
    };
    return item;
  });
}

function renderDefinitions() {
  renderList($("definition-list"), project.definitions, (definition, i) => {
    const item = document.createElement("li");
    item.innerHTML = `<label>Tag <input name="tag" placeholder="my-widget"></label>
      <label>Module URL <input name="src" placeholder="https://…/widget.mjs"></label>
      <label>Export <input name="exportName" placeholder="default"></label>
      <button type="button" name="remove">Remove component</button>`;
    for (const key of ["tag", "src", "exportName"]) item.querySelector(`[name=${key}]`).value = definition[key];
    item.onchange = () => {
      const tag = item.querySelector("[name=tag]").value.trim().toLowerCase();
      project.change(() => {
        project.definitions[i] = {
          tag: /^[a-z][a-z0-9]*-[a-z0-9-]*$/.test(tag) ? tag : definition.tag,
          src: item.querySelector("[name=src]").value.trim(),
          exportName: item.querySelector("[name=exportName]").value.trim() || "default",
        };
      });
      refresh();
    };
    item.querySelector("[name=remove]").onclick = () => {
      project.change(() => project.definitions.splice(i, 1));
      refresh();
    };
    return item;
  });
}

// The CSS rules that apply to the selected element; click one to find it.
function renderMatchingRules(element) {
  const list = $("matching-rules");
  const rules = [];
  if (element) {
    const sheet = new CSSStyleSheet();
    try {
      sheet.replaceSync(project.css);
    } catch {
      // unparseable CSS: no rules to show
    }
    const walk = (ruleList) => {
      for (const rule of ruleList) {
        if (rule instanceof CSSStyleRule) {
          try {
            if (element.matches(rule.selectorText)) rules.push(rule);
          } catch {
            // a selector this browser can't match against
          }
        }
        if (rule.cssRules) walk(rule.cssRules);
      }
    };
    walk(sheet.cssRules);
  }
  list.replaceChildren(
    ...(rules.length
      ? rules.map((rule) => {
          const button = Object.assign(document.createElement("button"), { type: "button", textContent: rule.cssText });
          button.onclick = () => {
            const css = $("css");
            const start = css.value.indexOf(rule.selectorText);
            if (start < 0) return;
            const end = css.value.indexOf("}", start);
            css.focus();
            css.setSelectionRange(start, end < 0 ? css.value.length : end + 1);
          };
          const li = document.createElement("li");
          li.append(button);
          return li;
        })
      : [Object.assign(document.createElement("li"), { className: "hint", textContent: element ? "No rules match it." : "Select an element." })]),
  );
}

// --- opening and saving ------------------------------------------------------

async function open(html, { from = "" } = {}) {
  loaded = false;
  defined.clear();
  project = Project.parse(html);
  // A page with relative URLs opened from elsewhere keeps pointing there.
  if (from && !project.base && project.usesRelativeURLs()) project.base = new URL(from, location.href).href;
  selectedPath = null;
  await refresh({ now: true });
  loaded = true;
  await refresh({ palette: false });
}

async function openURL(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  await open(await response.text(), { from: url });
}

async function start() {
  const requested = new URLSearchParams(location.search).get("project");
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // storage blocked
  }
  if (requested) await openURL(requested);
  else if (saved) await open(saved);
  else await openURL("./projects/blank.html");
}

// --- wiring --------------------------------------------------------------------

$("editor").addEventListener("command", (event) => {
  const action = { "--delete": "delete", "--duplicate": "duplicate" }[event.command];
  if (action) run(action);
});
// Undo/redo here rather than with <hot-key>: in a text field, ⌘Z belongs to the field.
addEventListener("keydown", (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.target.closest?.("input, textarea, select, [contenteditable]")) return;
  const key = event.key.toLowerCase();
  if (key === "z" && !event.shiftKey) run("undo");
  else if ((key === "z" && event.shiftKey) || key === "y") run("redo");
  else return;
  event.preventDefault();
});
$("undo").onclick = () => run("undo");
$("redo").onclick = () => run("redo");
// --- New page ------------------------------------------------------------------

// Libraries offered in the New dialog: the suggestions (suggestions.mjs),
// and packages added before in this browser.
const SUGGESTED = suggestions.LIBRARIES;
const RECENT_KEY = "htmlbuilder:packages";
const recentPackages = () => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]").filter((p) => p?.spec);
  } catch {
    return [];
  }
};
const rememberPackage = (name, spec) => {
  try {
    const list = [{ name, spec }, ...recentPackages().filter((p) => p.spec !== spec)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // storage blocked: nothing remembered
  }
};

$("new").onclick = () => {
  const form = $("new-form");
  form.reset();
  $("new-status").textContent = "";
  const offered = [...SUGGESTED, ...recentPackages().filter((p) => !SUGGESTED.some((s) => s.spec === p.spec))];
  $("new-packages").replaceChildren(
    ...offered.map(({ name, spec }) => {
      const label = Object.assign(document.createElement("label"), { className: "check" });
      const box = Object.assign(document.createElement("input"), { type: "checkbox", name: "package", value: spec });
      label.append(box, name, Object.assign(document.createElement("small"), { textContent: spec }));
      return label;
    }),
  );
  // Suggested pages, as starting points beside the others.
  const url = $("new-form").elements.url.closest("fieldset").querySelector('[value="url"]').closest("label");
  $("new-form").querySelectorAll("[data-suggested]").forEach((el) => el.remove());
  url.before(
    ...suggestions.PAGES.map(({ name, url: href }) => {
      const label = Object.assign(document.createElement("label"), { className: "check" });
      label.dataset.suggested = "";
      label.append(Object.assign(document.createElement("input"), { type: "radio", name: "start", value: `page:${href}` }), name);
      return label;
    }),
  );
  $("new-dialog").showModal();
};
// Typing a URL picks "A page at a URL".
$("new-form").elements.url.oninput = () => ($("new-form").elements.start.value = "url");
$("new-form").onsubmit = async (event) => {
  if (event.submitter?.value !== "create") return; // Cancel closes it
  event.preventDefault();
  const form = $("new-form").elements;
  const status = $("new-status");
  const specs = [
    ...[...$("new-packages").querySelectorAll("input:checked")].map((box) => box.value),
    ...form.packages.value.split("\n").map((s) => s.trim()).filter(Boolean),
  ];
  $("new-create").disabled = true;
  try {
    status.textContent = "Reading packages…";
    const libraries = [];
    for (const spec of specs) {
      const library = await libraryFromPackage(spec).catch((error) => Promise.reject(new Error(`${spec}: ${error.message}`)));
      libraries.push(library);
      rememberPackage(library.name, spec);
    }
    // The starting point, as a page.
    let html;
    let from = "";
    const page = form.start.value.startsWith("page:") ? form.start.value.slice(5) : form.start.value === "url" ? form.url.value.trim() : "";
    if (form.start.value === "url" && !page) throw new Error("Enter the page's URL.");
    if (page) {
      from = new URL(page, location.href).href;
      status.textContent = "Opening the page…";
      const response = await fetch(from);
      if (!response.ok) throw new Error(`${response.status} ${from}`);
      html = await response.text();
    } else if (form.start.value === "keep") {
      html = project.serialize();
    } else {
      html = await fetch("./projects/blank.html").then((r) => r.text());
    }
    const start = Project.parse(html);
    if (form.start.value === "keep") start.body.replaceChildren();
    if (from && !start.base && start.usesRelativeURLs()) start.base = from;
    start.title = form.title.value.trim() || (page ? start.title : "Untitled");
    for (const library of libraries) start.libraries = [...start.libraries.filter((l) => l.name !== library.name), library];
    $("new-dialog").close();
    await open(start.serialize());
  } catch (error) {
    status.textContent = error.message;
  } finally {
    $("new-create").disabled = false;
  }
};
$("open").onclick = () => $("open-file").click();
$("open-file").onchange = async () => {
  const file = $("open-file").files[0];
  if (file) await open(await file.text());
  $("open-file").value = "";
};
$("title").onchange = () => {
  project.change(() => (project.title = $("title").value.trim() || "Untitled"));
  refresh({ palette: false });
};
let cssTimer = 0;
let cssPending = false;
const commitCSS = () => {
  clearTimeout(cssTimer);
  if (!cssPending) return;
  cssPending = false;
  project.change(() => (project.css = $("css").value));
  refresh({ palette: false });
};
// Commit a moment after typing stops, or as soon as the field is left.
$("css").oninput = () => {
  cssPending = true;
  clearTimeout(cssTimer);
  cssTimer = setTimeout(commitCSS, 300);
};
$("css").onblur = commitCSS;
$("palette-filter").oninput = () => {
  paletteFilter = $("palette-filter").value;
  renderPalette($("palette"), { project, catalog, defined, filter: paletteFilter, onAdd: add });
};
$("add-definition").onclick = () => {
  project.change(() => project.definitions.push({ tag: "", src: "", exportName: "default" }));
  refresh();
};
$("same-origin").onchange = () => {
  project.change(() => (project.previewSameOrigin = $("same-origin").checked));
  refresh({ palette: false });
};
$("add-package").onsubmit = async (event) => {
  event.preventDefault();
  const input = $("package-url");
  const status = $("package-status");
  if (!input.value.trim()) return;
  status.textContent = "Reading package.json…";
  try {
    const library = await libraryFromPackage(input.value);
    project.change(() => {
      project.libraries = [...project.libraries.filter((l) => l.name !== library.name), library];
    });
    rememberPackage(library.name, input.value.trim());
    status.textContent = `Added ${library.name}.`;
    input.value = "";
    await refresh();
  } catch (error) {
    status.textContent = error.message;
  }
};
$("add-library").onclick = () => {
  project.change(() => project.libraries.push({ name: `library-${project.libraries.length + 1}`, modules: [], manifest: "" }));
  refresh();
};
// Drop an .html file anywhere to open it.
addEventListener("dragover", (event) => event.dataTransfer.types.includes("Files") && event.preventDefault());
addEventListener("drop", async (event) => {
  const file = [...(event.dataTransfer?.files ?? [])].find((f) => /\.html?$/i.test(f.name));
  if (!file) return;
  event.preventDefault();
  await open(await file.text());
});

// For tests and the console.
window.htmlbuilder = {
  get project() {
    return project;
  },
  open,
  openURL,
  select,
  ready: start(),
};
