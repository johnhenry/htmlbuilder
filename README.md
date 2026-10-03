# HTML Builder

A drag-and-drop editor for pages built from HTML elements, including
custom elements (web components) from any library. There's no build step:
serve the folder and open it.

![The snake game from johnhenry/forsnaken, built by dragging its elements together](screenshot.png)

**[Open it](https://johnhenry.github.io/htmlbuilder/)** ·
**[Open the snake game](https://johnhenry.github.io/htmlbuilder/?project=https://johnhenry.github.io/forsnaken/builder.html)**
(forsnaken's own page for builders: htmlbuilder knows nothing about forsnaken,
and forsnaken nothing about htmlbuilder)

## Using it

- **New** opens a dialog: a title; what to start from (an empty page, this
  page's libraries, snippets, and CSS with nothing on it, or a page at a
  URL); and which libraries to add (domkit, packages you've added before in
  this browser, or any package URL or npm name). The suggested libraries
  and pages (domkit, and forsnaken's game) are plain links in
  [`src/suggestions.mjs`](src/suggestions.mjs); edit that list freely.
- **Palette** (left): snippets saved in the project, every custom element
  its libraries describe, elements the page defines that no manifest
  describes ("Defined in the page"), and common HTML. Drag an entry onto the page
  outline, or click it to add it inside the selected element.
- **Page** (outline): the page as HTML, one tag per line: start tags with
  their attributes, children indented, then the end tag (an element without
  children is one line; `<img>` and other void elements have no end tag).
  Drops land where the line between rows suggests: the upper half of a
  start tag goes before the element and the lower half inside it, first;
  the upper half of an end tag goes inside, last, and the lower half after
  it. On a one-line element, the top edge is before, the middle inside,
  and the bottom edge after. Drag a tag (either one) to move its element. <kbd>Delete</kbd> removes the selection, <kbd>⌘D</kbd>/<kbd>Ctrl+D</kbd>
  duplicates it, <kbd>⌘Z</kbd>/<kbd>Ctrl+Z</kbd> undoes.
- **Preview** (middle): the page, running, in a sandboxed frame. Edits are
  patched into it as you make them, so what's running keeps running: swap
  a snake's brain mid-game and the same snake carries on. Changing
  libraries or components reloads it, and **Restart preview** starts it
  afresh.
  <kbd>Alt</kbd>/<kbd>Option</kbd>-click an element in it to select it.
- **Element** panel: the selected element's attributes, and its text (or,
  for an element with children, the text before and after them). For a
  custom element whose library has a manifest, each documented attribute
  gets the right control (a checkbox for booleans, a number field, a menu
  for a fixed set of values), with its description as a tooltip.
- **CSS** panel: the page's styles, and the rules that match the selected
  element (click one to find it).
- **Snippets** panel: rename, edit, or delete the palette's snippets.
- **Libraries** panel: add a library from a package URL (or an npm name),
  or by hand; components defined
  straight from a module URL (a tag, the URL, and which export); and
  whether the preview may load from this page's origin.

## A project is a web page

Download gives you the page itself, and that file is also the project:
open it again (Open…, or drop it on the editor) to keep editing.

```html
<head>
  <meta name="htmlbuilder-manifest" content="domkit https://…/custom-elements.json">
  <script type="module" src="https://…/frame-timer/global.mjs" data-library="domkit"></script>
  <template data-snippet="Clock (12 fps)"><frame-timer fps="12"></frame-timer></template>
  <style>…</style>
</head>
<body>…what you built…</body>
```

- **Libraries** are module `<script>`s (grouped by `data-library`), plus
  an optional [Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest)
  that tells the editor what each element is and which attributes it takes.
  See [Libraries](#libraries) below.
- **Snippets** are `<template data-snippet>`s: ready-made markup for the
  palette. Select an element and use *Save as snippet* to add one.
- **Components from a URL** are module scripts that import the export and
  call `customElements.define()` (marked `data-define`, so the editor can
  read them back).
- The editor saves as you go (in this browser), and `?project=URL` opens
  a project from a URL. If it has relative URLs (`./game/global.mjs`), a
  `<base href>` is added pointing back where it came from, so they keep
  working in the preview and in the downloaded page.
- Everything here is plain HTML that browsers ignore or run as usual, so
  a project is also a page anyone can serve, and any page can be opened.

## Libraries

**Loading.** A library is loaded the way any page loads a web component:
a `<script type="module" src>` for a module that registers its elements
(calls `customElements.define()` when it runs). Nothing is imported by
name, and the editor never sees a class. Each library chooses its own tag
names; the editor only uses the tags. (Components from a URL are the one
exception: there you name the tag and the export, and the editor writes
`import * as module from "…"` and `customElements.define(tag, module[export])`.)

**Describing.** What the palette and the Element panel know comes from the
library's `custom-elements.json`, the standard
[Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest):
each element's tag, summary, and attributes with their types (a `boolean`
gets a checkbox, `"a" | "b"` a menu), and, through
`custom-element-definition` exports, which module registers each tag.

**Adding.** *Add a library from a package* takes a package's URL (say
`https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@<commit>/`) or an npm
name (`@johnhenry/domkit`, from jsDelivr). It reads `package.json`, follows
its `customElements` field to the manifest (the format's convention), and
lists the elements. Using one (dropping or clicking it) adds the module
that registers it to the page, once: the page loads only what it uses. A
package with no manifest loads its entry point instead.

**Without a manifest.** The preview reports every element the page
defines, with the attributes its class observes (`observedAttributes`).
Those elements are listed under "Defined in the page", and the Element
panel offers a text field for each observed attribute.

**Removing** a library removes its scripts and its palette entries. Its
elements stay in the page (and its snippets in the project) as unknown
tags until you remove them or add a library that defines them.

To make a library work well here (and in any tool that reads manifests):
ship a `custom-elements.json` with `custom-element-definition` exports,
and point `package.json`'s `customElements` field at it. Both
[domkit](https://github.com/johnhenry/domkit) and
[forsnaken](https://github.com/johnhenry/forsnaken) do.

## How it works

| File | What it does |
|---|---|
| [`src/project.mjs`](src/project.mjs) | The project: parsing and writing the page, paths to elements, edits with undo |
| [`src/outline.mjs`](src/outline.mjs) | The page outline as HTML, and where drops land |
| [`src/palette.mjs`](src/palette.mjs) | The palette, from snippets, manifests, and [`html-basics.mjs`](src/html-basics.mjs) |
| [`src/manifests.mjs`](src/manifests.mjs) | Reading `custom-elements.json` and `package.json`, and choosing a control for each attribute type |
| [`src/inspector.mjs`](src/inspector.mjs) | The Element panel |
| [`src/preview.mjs`](src/preview.mjs) | The sandboxed preview, which reports the elements the page defines |
| [`src/live.mjs`](src/live.mjs) / [`src/preview-runtime.mjs`](src/preview-runtime.mjs) | Live editing: the patch from what the preview has to the page now, and the preview's side that applies it |
| [`src/editor.mjs`](src/editor.mjs) | Wires them together; opening, saving, shortcuts |

The page being edited lives in a document with no browsing context, so
custom elements in it are just markup: they never run there. The preview
is rebuilt from the page's HTML after each change, so it's always exactly
what Download gives you, and a component's own children or attributes
can't confuse the editor.

**Live editing.** The preview loads the page once; after that, each edit is
sent as a patch: the elements whose tag, attributes, or children changed,
by id (ids survive moves and undo). The preview records the page as
written before any library runs, and a patch only ever touches that:
children a component made for itself, and attributes it set on itself,
are left alone. Moved elements are moved, not recreated, so they keep
their state. This relies on elements that take attribute changes and
moves in their stride, which is what domkit's principles require and what
forsnaken's elements do. A change no patch can make (libraries,
components, the base URL, or a `<script>` added, changed, or removed)
reloads the preview, since the browser can't redefine an element or un-run
a script.

The editor's own interface uses [domkit](https://github.com/johnhenry/domkit)
(`<tabbed-ui>` for the panels, `<hot-key>` for shortcuts), loaded from
jsDelivr.

## Developing

```sh
npm install
npm run serve   # http://localhost:4830/
npm test        # Playwright: builds the snake game by drag and drop, and more

The tests use forsnaken's `builder.html` and packages from jsDelivr, pinned
by commit: real outside projects, opened the way anyone's would be.
```

## Notes

- The preview is sandboxed without same-origin access, so every module a
  page imports is a cross-origin request and must be served with CORS
  headers. jsDelivr, unpkg, esm.sh, and GitHub Pages send them; most quick
  local servers don't. For components on your own machine, either:
  - serve them with CORS on (`npx http-server --cors`, `npx serve --cors`),
    which works with the editor running anywhere, including GitHub Pages; or
  - run the editor from the same server as your components (`npm run
    serve` serves this repository; put them beside it) and tick *Load from
    this page's origin* (Libraries panel). That only helps for modules on
    the editor's own origin: a server on another port is another origin.
    It also lets the page's code reach the editor, so use it only for
    code you trust.
- The 2021 version kept a JSON model alongside the page, and rebuilt the
  preview element by element. Its reconciler deleted children that
  components created for themselves (a renderer's `<canvas>`), which is
  why the snake game wouldn't render in it. It's in this repository's
  history before this rewrite.
