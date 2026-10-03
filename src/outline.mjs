// The outline: the page as HTML, one tag per line. An element with
// children has a start tag (with its attributes, as in HTML), its
// children indented, and an end tag; an element without children is one
// line, <tag …></tag>; void elements (<img>, <input>) have no end tag.
// Text shows where it is: between the tags, or before/after the children.
// Tags are colored by depth, so a start tag and its end tag match, with a
// guide line between them; hovering either tag highlights both.
//
// Click a tag to select its element. Drag tags (or palette entries) onto
// the outline, and they land where the line between rows suggests:
//   start tag:  upper half -> before the element;  lower half -> inside, first
//   end tag:    upper half -> inside, last;        lower half -> after the element
//   one line:   top quarter -> before;  middle -> inside;  bottom quarter -> after
import { NEW_TYPE } from "./palette.mjs";

export const MOVE_TYPE = "application/x-htmlbuilder-move";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const OPAQUE = new Set(["template", "script", "style", "svg"]); // shown on one line, contents not outlined

const shorten = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);

// "<tag attr="value" flag>", as spans so the parts can be styled.
function startTag(el) {
  const code = document.createElement("code");
  code.className = "tag";
  code.append("<", Object.assign(document.createElement("span"), { className: "name", textContent: el.localName }));
  for (const { name, value } of el.attributes) {
    // One unit per attribute, so long tags wrap between attributes.
    const attribute = Object.assign(document.createElement("span"), { className: "attribute" });
    attribute.append(Object.assign(document.createElement("span"), { className: "attribute-name", textContent: name }));
    if (value !== "") {
      attribute.append("=", Object.assign(document.createElement("span"), { className: "value", textContent: `"${shorten(value, 40)}"` }));
    }
    code.append(" ", attribute);
  }
  (code.lastElementChild?.matches(".attribute") ? code.lastElementChild : code).append(">"); // never wraps alone
  return code;
}

const endTag = (el) => {
  const code = document.createElement("code");
  code.className = "tag closing";
  code.append("</", Object.assign(document.createElement("span"), { className: "name", textContent: el.localName }), ">");
  return code;
};

const textOf = (nodes) => nodes.filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent.trim()).filter(Boolean).join(" ");

/**
 * @param {HTMLElement} tree the <ul role="tree">
 * @param {{ project: import("./project.mjs").Project, selected: Element | null, onSelect: (el: Element | null) => void, onDrop: (data: { html?: string, path?: number[] }, target: Element | null, position: string) => void }} options
 */
export function renderOutline(tree, { project, selected, onSelect, onDrop }) {
  const rows = new Map(); // row -> { element, kind: "start" | "end" | "line" }
  const makeRow = (el, kind, ...parts) => {
    const row = document.createElement("div");
    row.className = `row ${kind}`;
    row.draggable = true;
    row.tabIndex = el === selected && kind !== "end" ? 0 : -1;
    row.append(...parts.filter(Boolean));
    rows.set(row, { element: el, kind });
    return row;
  };
  const text = (value) => value && Object.assign(document.createElement("span"), { className: "text", textContent: shorten(value, 40) });

  const build = (parent, depth) => {
    const items = [];
    for (const el of parent.children) {
      const li = document.createElement("li");
      li.role = "treeitem";
      li.setAttribute("aria-level", String(depth));
      li.dataset.color = String((depth - 1) % 6); // a start tag and its end tag share a color
      li.setAttribute("aria-selected", String(el === selected));
      const nodes = [...el.childNodes];
      if (el.children.length && !OPAQUE.has(el.localName)) {
        const first = nodes.findIndex((n) => n.nodeType === Node.ELEMENT_NODE);
        const last = nodes.findLastIndex((n) => n.nodeType === Node.ELEMENT_NODE);
        const group = document.createElement("ul");
        group.role = "group";
        group.append(...build(el, depth + 1));
        li.setAttribute("aria-expanded", "true");
        li.append(
          makeRow(el, "start", startTag(el), text(textOf(nodes.slice(0, first)))),
          group,
          makeRow(el, "end", text(textOf(nodes.slice(last + 1))), endTag(el)),
        );
      } else {
        li.append(makeRow(el, "line", startTag(el), text(textOf(nodes)), VOID.has(el.localName) ? null : endTag(el)));
      }
      items.push(li);
    }
    return items;
  };
  const hadFocus = tree.contains(document.activeElement) || document.activeElement === tree;
  tree.replaceChildren(...build(project.body, 1));
  tree.classList.toggle("empty", !project.body.children.length);
  tree.tabIndex = selected ? -1 : 0; // the selected element's tag is the tab stop when there is one
  if (hadFocus) (tree.querySelector('[aria-selected="true"] > .row:not(.end)') ?? tree).focus();

  const rowOf = (event) => event.target.closest?.(".row");
  // Where a drop on this row goes, from how far down the row the pointer is.
  const positionIn = (row, event) => {
    const { kind } = rows.get(row);
    const box = row.getBoundingClientRect();
    const y = (event.clientY - box.top) / box.height;
    if (kind === "start") return y < 0.5 ? "before" : "first";
    if (kind === "end") return y < 0.5 ? "inside" : "after";
    return y < 0.25 ? "before" : y > 0.75 ? "after" : "inside";
  };
  const clearMarks = () => tree.querySelectorAll("[data-drop]").forEach((r) => r.removeAttribute("data-drop"));

  // ↑/↓ move the selection through the elements in order; Home/End jump.
  tree.onkeydown = (event) => {
    const all = [...tree.querySelectorAll(".row:not(.end)")];
    if (!all.length || event.altKey || event.ctrlKey || event.metaKey) return;
    const current = all.findIndex((r) => rows.get(r).element === selected);
    const next = { ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: all.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const row = all[Math.max(0, Math.min(all.length - 1, current < 0 ? 0 : next))];
    onSelect(rows.get(row).element);
  };
  tree.onclick = (event) => {
    const row = rowOf(event);
    onSelect(row ? rows.get(row).element : null);
  };
  tree.ondragstart = (event) => {
    const row = rowOf(event);
    if (!row) return;
    event.dataTransfer.setData(MOVE_TYPE, JSON.stringify(project.pathOf(rows.get(row).element)));
    event.dataTransfer.effectAllowed = "move";
  };
  tree.ondragover = (event) => {
    const types = event.dataTransfer.types;
    if (!types.includes(NEW_TYPE) && !types.includes(MOVE_TYPE)) return;
    event.preventDefault();
    clearMarks();
    const row = rowOf(event);
    if (row) row.dataset.drop = positionIn(row, event);
  };
  tree.ondragleave = (event) => {
    if (!tree.contains(event.relatedTarget)) clearMarks();
  };
  tree.ondrop = (event) => {
    const html = event.dataTransfer.getData(NEW_TYPE);
    const move = event.dataTransfer.getData(MOVE_TYPE);
    if (!html && !move) return;
    event.preventDefault();
    clearMarks();
    const row = rowOf(event);
    onDrop(html ? { html } : { path: JSON.parse(move) }, row ? rows.get(row).element : null, row ? positionIn(row, event) : "inside");
  };
  return rows;
}
