// The preview's side of live editing, inlined into the preview page as the
// first module script, so it runs after the page is parsed and before any
// library defines an element: at that moment, everything in <body> is
// exactly what the editor wrote. It records those nodes, tells the editor
// it's ready, and from then on applies the editor's patches.
//
// A patch never touches what the editor didn't write: children an element
// made for itself are left where they are, and so are attributes it set on
// itself. (The 2021 editor's live preview broke on exactly those two.)
// Moved elements are moved, not recreated, so they keep their state: a
// running game carries on while you swap a snake's brain.

/** The script's source, for a page load identified by `token`. @param {number} token */
export const previewRuntime = (token) => `(${runtime})(${JSON.stringify(token)});`;

function runtime(token) {
  const SELECTED = "data-htmlbuilder-selected";
  const authored = new WeakSet(); // nodes the editor wrote
  const authoredAttributes = new WeakMap(); // element -> names of the attributes the editor set
  const byId = new Map(); // the editor's ids -> elements (removed ones too, for undo)
  const idOf = new WeakMap();

  const significant = (node) => authored.has(node) && !(node.nodeType === Node.TEXT_NODE && !node.data.trim());
  const record = (el) => {
    authored.add(el);
    authoredAttributes.set(el, new Set(el.getAttributeNames().filter((name) => name !== SELECTED)));
  };

  const elements = [...document.body.querySelectorAll("*")];
  elements.forEach(record);
  const texts = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (texts.nextNode()) authored.add(texts.currentNode);
  authored.add(document.body);
  parent.postMessage({ htmlbuilder: "ready", token, tags: elements.map((el) => el.localName) }, "*");

  addEventListener("message", (event) => {
    if (event.source !== parent) return;
    const message = event.data;
    if (message?.htmlbuilder === "bind" && message.token === token) {
      message.ids.forEach((id, i) => {
        byId.set(id, elements[i]);
        idOf.set(elements[i], id);
      });
      byId.set(0, document.body);
      idOf.set(document.body, 0);
      apply(message.patch);
    }
    if (message?.htmlbuilder === "patch" && message.token === token) apply(message.patch);
  });

  function apply({ ops = [], css, title, selected } = {}) {
    // New elements first, then everyone's attributes, then their children
    // (so a child can move between parents in one patch).
    for (const op of ops) {
      if (byId.has(op.id)) continue;
      const el = document.createElementNS(op.ns, op.tag);
      record(el);
      byId.set(op.id, el);
      idOf.set(el, op.id);
    }
    for (const op of ops) {
      const el = byId.get(op.id);
      if (op.id === 0 || !op.attributes) continue;
      const names = new Set();
      for (const [name, value] of op.attributes) {
        names.add(name);
        if (el.getAttribute(name) !== value) el.setAttribute(name, value);
      }
      for (const name of authoredAttributes.get(el) ?? []) if (!names.has(name)) el.removeAttribute(name);
      authoredAttributes.set(el, names);
    }
    for (const op of ops) {
      const el = byId.get(op.id);
      if ("raw" in op) {
        if (el.innerHTML !== op.raw) el.innerHTML = op.raw;
      } else if (op.children) {
        reconcile(el, op.children);
      }
    }
    if (css !== undefined) {
      const style = document.querySelector("style[data-htmlbuilder-css]");
      if (style) style.textContent = css;
    }
    if (title !== undefined) document.title = title;
    if (selected !== undefined) {
      for (const el of document.querySelectorAll(`[${SELECTED}]`)) el.removeAttribute(SELECTED);
      byId.get(selected)?.setAttribute(SELECTED, "");
    }
  }

  // Put `parent`'s authored children in the order `items` gives (ids of
  // elements, or { text }), moving only what's out of place.
  function reconcile(parentNode, items) {
    const current = [...parentNode.childNodes].filter(significant);
    const spareTexts = current.filter((n) => n.nodeType === Node.TEXT_NODE);
    const target = items.map((item) => {
      if (typeof item === "number") return byId.get(item);
      const reuse = spareTexts.findIndex((n) => n.data.trim() === item.text.trim());
      if (reuse >= 0) return spareTexts.splice(reuse, 1)[0];
      const text = document.createTextNode(item.text);
      authored.add(text);
      return text;
    }).filter(Boolean);
    const keep = new Set(target);
    for (const node of current) if (!keep.has(node) && node.parentNode === parentNode) node.remove();
    const nextAuthored = (node) => {
      let next = node.nextSibling;
      while (next && !significant(next)) next = next.nextSibling;
      return next;
    };
    let previous = null;
    for (const node of target) {
      if (previous) {
        if (nextAuthored(previous) !== node) previous.after(node);
      } else {
        let first = parentNode.firstChild;
        while (first && !significant(first)) first = first.nextSibling;
        if (first !== node) first ? first.before(node) : parentNode.append(node);
      }
      previous = node;
    }
  }

  // Alt-click (Option-click) selects the nearest element the editor wrote.
  addEventListener(
    "click",
    (event) => {
      if (!event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      let el = event.target;
      while (el && el !== document.body && !idOf.has(el)) el = el.parentElement;
      if (el && el !== document.body) parent.postMessage({ htmlbuilder: "select", id: idOf.get(el) }, "*");
    },
    true,
  );
}
