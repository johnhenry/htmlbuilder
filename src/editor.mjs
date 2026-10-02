// The editor: one Project (project.mjs), and four views of it: palette,
// outline, inspector, and preview. Every edit goes through
// project.change(), which records undo and triggers a refresh.
import { Project } from "./project.mjs";
import { renderPalette } from "./palette.mjs";
import { renderOutline } from "./outline.mjs";
import { renderInspector, setTextAround } from "./inspector.mjs";
import { connectPreview } from "./preview.mjs";
import { describeAll } from "./manifests.mjs";

const STORAGE_KEY = "htmlbuilder:project";
const $ = (id) => document.getElementById(id);

let project;
let selectedPath = null;
let loaded = false; // nothing is saved until a project has fully loaded
let paletteFilter = "";
let inspected = null;

const selected = () => (selectedPath ? project.nodeAt(selectedPath) : null);
const select = (element) => {
  selectedPath = element && project.body.contains(element) && element !== project.body ? project.pathOf(element) : null;
  refresh({ palette: false });
};

const preview = connectPreview($("preview"), (path) => {
  const element = project.nodeAt(path);
  if (element) select(element);
});

async function refresh({ palette = true, now = false } = {}) {
  const element = selected();
  renderOutline($("tree"), {
    project,
    selected: element,
    onSelect: select,
    onDrop: drop,
  });
  const info = element ? (await describeAll(project.libraries)).get(element.localName) : undefined;
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
  if (palette) await renderPalette($("palette"), { project, filter: paletteFilter, onAdd: add });
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
  edit(() => project.place(project.fragment(html), selected(), "inside"));
}

function drop({ html, path }, target, position) {
  edit(() => {
    const nodes = html ? project.fragment(html) : [project.nodeAt(path)].filter(Boolean);
    return project.place(nodes, target, position);
  });
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

async function open(html) {
  loaded = false;
  project = Project.parse(html);
  selectedPath = null;
  await refresh({ now: true });
  loaded = true;
  await refresh({ palette: false });
}

async function openURL(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  await open(await response.text());
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
$("new").onclick = async () => {
  if (confirm("Start a new, empty page? (Download this one first to keep it.)")) await openURL("./projects/blank.html");
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
  renderPalette($("palette"), { project, filter: paletteFilter, onAdd: add });
};
$("add-definition").onclick = () => {
  project.change(() => project.definitions.push({ tag: "", src: "", exportName: "default" }));
  refresh();
};
$("same-origin").onchange = () => {
  project.change(() => (project.previewSameOrigin = $("same-origin").checked));
  refresh({ palette: false });
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
