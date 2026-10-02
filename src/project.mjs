// A project is an HTML document: library <script>s and a <style> in the
// head, and the page's markup in the body. Saving, exporting, and opening
// all use the same file, so what you build is what you get.
//
//   <head>
//     <base href="https://…/">    <- optional: where relative URLs point (added
//                                    when a project with relative URLs is opened from a URL)
//     <meta name="htmlbuilder-manifest" content="domkit https://…/custom-elements.json">
//     <script type="module" src="https://…/frame-timer/global.mjs" data-library="domkit"></script>
//     <script type="module" data-define="my-widget" data-src="…/widget.mjs" data-export="default">…</script>
//                                                       <- a component defined from a module URL
//     <template data-snippet="Snake">…</template>          <- palette snippets
//     <meta name="htmlbuilder-preview" content="same-origin"> <- optional; see preview.mjs
//     <style>…</style>
//   </head>
//   <body>…</body>
//
// The markup lives in a document with no browsing context, so custom
// elements in it are never upgraded or run: it's just a tree to edit. The
// preview runs it (preview.mjs).

const PREVIEW_STYLE = "[data-htmlbuilder-selected] { outline: 2px dashed #e040a0 !important; outline-offset: 2px; }";
// In the preview only: Alt-click (Option-click) selects that element in
// the editor, and every custom element defined is reported with the
// attributes it watches (observedAttributes), so the editor knows about
// elements no manifest describes. It runs before any module script.
const PREVIEW_SCRIPT = `{
  const defined = {};
  let timer = 0;
  const define = customElements.define;
  customElements.define = function (name, constructor, options) {
    define.call(this, name, constructor, options);
    let attributes = [];
    try {
      attributes = [...(constructor.observedAttributes ?? [])].map(String);
    } catch {}
    defined[name] = attributes;
    clearTimeout(timer);
    timer = setTimeout(() => parent.postMessage({ htmlbuilder: "defined", elements: defined }, "*"));
  };
}
addEventListener("click", (event) => {
  if (!event.altKey) return;
  event.preventDefault();
  event.stopPropagation();
  const path = [];
  for (let el = event.target; el && el !== document.body; el = el.parentElement) path.unshift([...el.parentElement.children].indexOf(el));
  parent.postMessage({ htmlbuilder: "select", path }, "*");
}, true);`;
const RAW = new Set(["script", "style", "pre", "textarea", "template"]);
const escapeAttribute = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

// A module script that defines `tag` from a module's export, once. (The
// 2021 version wrote the tag unquoted, so its exports threw.)
const defineScript = ({ tag, src, exportName }) =>
  `<script type="module" data-define="${escapeAttribute(tag)}" data-src="${escapeAttribute(src)}" data-export="${escapeAttribute(exportName)}">` +
  `import * as module from ${JSON.stringify(src)}; customElements.get(${JSON.stringify(tag)}) || customElements.define(${JSON.stringify(tag)}, module[${JSON.stringify(exportName)}]);` +
  "</script>";

/**
 * Markup with one element per line, indented, and every element closed.
 * Elements holding text (or raw content) are written as they are.
 * @param {Node} node
 * @param {number} depth
 */
export function pretty(node, depth = 0) {
  const pad = "  ".repeat(depth);
  const lines = [];
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent.trim()) lines.push(pad + child.textContent.trim());
    } else if (child.nodeType === Node.COMMENT_NODE) {
      lines.push(`${pad}<!--${child.data}-->`);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const hasText = [...child.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (RAW.has(child.localName) || hasText || !child.children.length) {
        lines.push(pad + child.outerHTML);
      } else {
        const open = child.outerHTML.slice(0, child.outerHTML.indexOf(">") + 1);
        lines.push(pad + open, pretty(child, depth + 1), `${pad}</${child.localName}>`);
      }
    }
  }
  return lines.filter((line) => line !== "").join("\n");
}

export class Project extends EventTarget {
  /** @type {Document} */
  doc;
  title = "Untitled";
  css = "";
  /** @type {{ name: string, modules: string[], manifest: string }[]} */
  libraries = [];
  /** @type {{ name: string, html: string }[]} */
  snippets = [];
  /** Components defined from a module URL: `tag` is registered with `src`'s `exportName` export. */
  /** @type {{ tag: string, src: string, exportName: string }[]} */
  definitions = [];
  /** Let the preview load from this page's origin (for local, non-CORS servers). */
  previewSameOrigin = false;
  /** Where relative URLs point: the page's <base href>, or "". */
  base = "";
  #undo = [];
  #redo = [];

  constructor() {
    super();
    this.doc = document.implementation.createHTMLDocument("");
  }

  get body() {
    return this.doc.body;
  }

  /**
   * Read a project from its HTML.
   * @param {string} html
   * @returns {Project}
   */
  static parse(html) {
    const project = new Project();
    project.#load(html);
    return project;
  }

  #load(html) {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    this.title = parsed.title || "Untitled";
    this.base = parsed.head.querySelector("base[href]")?.getAttribute("href") ?? "";
    const libraries = new Map();
    const library = (name) => {
      if (!libraries.has(name)) libraries.set(name, { name, modules: [], manifest: "" });
      return libraries.get(name);
    };
    for (const meta of parsed.head.querySelectorAll('meta[name="htmlbuilder-manifest"]')) {
      const [name, url = ""] = (meta.content ?? "").trim().split(/\s+/);
      if (name) library(name).manifest = url;
    }
    this.definitions = [...parsed.head.querySelectorAll("script[type=module][data-define]")].map((s) => ({
      tag: s.dataset.define,
      src: s.dataset.src ?? "",
      exportName: s.dataset.export || "default",
    }));
    this.previewSameOrigin = parsed.head.querySelector('meta[name="htmlbuilder-preview"]')?.content.trim() === "same-origin";
    for (const script of parsed.head.querySelectorAll("script[type=module][src]")) {
      library(script.dataset.library || script.getAttribute("src")).modules.push(script.getAttribute("src"));
    }
    this.libraries = [...libraries.values()];
    this.snippets = [...parsed.head.querySelectorAll("template[data-snippet]")].map((t) => ({ name: t.dataset.snippet, html: t.innerHTML.trim() }));
    this.css = [...parsed.head.querySelectorAll("style")].map((s) => s.textContent.trim()).join("\n\n");
    this.body.replaceChildren(...[...parsed.body.childNodes].map((n) => this.doc.importNode(n, true)));
  }

  /**
   * The project as an HTML document. With `preview`, the selected element
   * is marked and Alt-click selection is wired up (never saved).
   * @param {{ preview?: boolean, selected?: Element | null }} [options]
   * @returns {string}
   */
  serialize({ preview = false, selected = null } = {}) {
    let body = this.body;
    if (preview && selected && this.body.contains(selected)) {
      body = this.body.cloneNode(true);
      this.nodeAt(this.pathOf(selected), body)?.setAttribute("data-htmlbuilder-selected", "");
    }
    const head = [
      '<meta charset="utf-8">',
      ...(this.base ? [`<base href="${escapeAttribute(this.base)}">`] : []),
      ...(preview ? [`<script>${PREVIEW_SCRIPT}</script>`] : []),
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${this.title.replace(/</g, "&lt;")}</title>`,
      ...this.libraries.filter((l) => l.manifest).map((l) => `<meta name="htmlbuilder-manifest" content="${escapeAttribute(`${l.name} ${l.manifest}`)}">`),
      ...(this.previewSameOrigin ? ['<meta name="htmlbuilder-preview" content="same-origin">'] : []),
      ...this.libraries.flatMap((l) => l.modules.map((src) => `<script type="module" src="${escapeAttribute(src)}" data-library="${escapeAttribute(l.name)}"></script>`)),
      ...this.definitions.filter((d) => d.tag && d.src).map(defineScript),
      ...this.snippets.map((s) => `<template data-snippet="${escapeAttribute(s.name)}">${s.html}</template>`),
      ...(this.css.trim() ? [`<style>\n${this.css.trim()}\n</style>`] : []),
      ...(preview ? [`<style>${PREVIEW_STYLE}</style>`] : []),
    ];
    const markup = pretty(body, 2);
    return `<!doctype html>\n<html lang="en">\n  <head>\n${head.map((line) => `    ${line}`).join("\n")}\n  </head>\n  <body>\n${markup}${markup ? "\n" : ""}  </body>\n</html>\n`;
  }

  // --- paths: an element's position as child indices from <body> ---------

  /** @param {Element} node */
  pathOf(node) {
    const path = [];
    for (let el = node; el && el !== this.body; el = el.parentElement) path.unshift([...el.parentElement.children].indexOf(el));
    return path;
  }

  /** @param {number[]} path @param {Element} [root] */
  nodeAt(path, root = this.body) {
    let node = root;
    for (const i of path) node = node?.children[i];
    return node ?? null;
  }

  // --- changes, with undo ---------------------------------------------------

  #snapshot() {
    return {
      html: this.body.innerHTML,
      css: this.css,
      snippets: structuredClone(this.snippets),
      libraries: structuredClone(this.libraries),
      definitions: structuredClone(this.definitions),
      previewSameOrigin: this.previewSameOrigin,
      base: this.base,
    };
  }

  #restore(state) {
    this.body.innerHTML = state.html;
    this.css = state.css;
    this.snippets = state.snippets;
    this.libraries = state.libraries;
    this.definitions = state.definitions;
    this.previewSameOrigin = state.previewSameOrigin;
    this.base = state.base;
  }

  /** Whether any URL in the project is relative (so it depends on where the page is). */
  usesRelativeURLs() {
    const urls = [
      ...this.libraries.flatMap((l) => [...l.modules, l.manifest]),
      ...this.definitions.map((d) => d.src),
      ...[...this.body.querySelectorAll("[src], [href]")].map((el) => el.getAttribute("src") ?? el.getAttribute("href")),
    ];
    return urls.some((url) => url && !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url));
  }

  /**
   * Make a change: `fn` edits the project; it's recorded for undo, and
   * "change" fires (with `detail.selected`, the element to select, if
   * `fn` returns one).
   * @param {() => Element | void} fn
   */
  change(fn) {
    const before = this.#snapshot();
    const selected = fn();
    const after = this.#snapshot();
    if (JSON.stringify(before) === JSON.stringify(after)) return selected;
    this.#undo.push(before);
    if (this.#undo.length > 200) this.#undo.shift();
    this.#redo = [];
    this.dispatchEvent(new CustomEvent("change", { detail: { selected } }));
    return selected;
  }

  get canUndo() {
    return this.#undo.length > 0;
  }
  get canRedo() {
    return this.#redo.length > 0;
  }

  undo() {
    if (!this.#undo.length) return;
    this.#redo.push(this.#snapshot());
    this.#restore(this.#undo.pop());
    this.dispatchEvent(new CustomEvent("change", { detail: { selected: null } }));
  }

  redo() {
    if (!this.#redo.length) return;
    this.#undo.push(this.#snapshot());
    this.#restore(this.#redo.pop());
    this.dispatchEvent(new CustomEvent("change", { detail: { selected: null } }));
  }

  // --- editing ----------------------------------------------------------------

  /**
   * Parse markup into nodes belonging to this project.
   * @param {string} html
   * @returns {Node[]}
   */
  fragment(html) {
    const template = this.doc.createElement("template");
    template.innerHTML = html.trim();
    return [...template.content.childNodes].map((n) => this.doc.importNode(n, true));
  }

  /**
   * Put nodes before or after `target`, or inside it as its first or last
   * children (`first` / `inside`). A null target is the body. Returns the
   * first element placed.
   * @param {Node[]} nodes
   * @param {Element | null} target
   * @param {"before" | "after" | "first" | "inside"} position
   */
  place(nodes, target, position = "inside") {
    target ??= this.body;
    if (target === this.body && (position === "before" || position === "after")) position = "inside";
    if (nodes.some((node) => node === target || node.contains(target))) return null; // not into itself
    if (position === "before") target.before(...nodes);
    else if (position === "after") target.after(...nodes);
    else if (position === "first") target.prepend(...nodes);
    else target.append(...nodes);
    return nodes.find((node) => node.nodeType === Node.ELEMENT_NODE) ?? null;
  }
}
