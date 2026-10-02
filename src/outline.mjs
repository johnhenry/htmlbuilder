// The outline: the page's elements as a tree. Select by clicking; drag
// elements (or palette entries) onto a row to drop them before it (top
// quarter), after it (bottom quarter), or inside it (the middle).
import { NEW_TYPE } from "./palette.mjs";

export const MOVE_TYPE = "application/x-htmlbuilder-move";

const summary = (el) => {
  const id = el.id ? `#${el.id}` : "";
  const classes = el.classList.length ? `.${[...el.classList].join(".")}` : "";
  const attributes = [...el.attributes]
    .filter((a) => a.name !== "id" && a.name !== "class")
    .map((a) => (a.value === "" ? a.name : `${a.name}="${a.value.length > 24 ? `${a.value.slice(0, 24)}…` : a.value}"`))
    .join(" ");
  const text = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent.trim()).join(" ").trim();
  return { name: `${el.localName}${id}${classes}`, attributes, text: text.length > 30 ? `${text.slice(0, 30)}…` : text };
};

/**
 * @param {HTMLElement} tree the <ul role="tree">
 * @param {{ project: import("./project.mjs").Project, selected: Element | null, onSelect: (el: Element | null) => void, onDrop: (data: { html?: string, path?: number[] }, target: Element | null, position: string) => void }} options
 */
export function renderOutline(tree, { project, selected, onSelect, onDrop }) {
  const rows = new Map(); // row element -> project element
  const build = (parent, depth) => {
    const items = [];
    for (const el of parent.children) {
      const li = document.createElement("li");
      li.role = "treeitem";
      li.setAttribute("aria-level", String(depth));
      li.setAttribute("aria-selected", String(el === selected));
      const row = document.createElement("div");
      row.className = "row";
      row.draggable = true;
      row.tabIndex = el === selected ? 0 : -1;
      const { name, attributes, text } = summary(el);
      const tag = Object.assign(document.createElement("code"), { className: "tag", textContent: `<${name}>` });
      row.append(tag);
      if (attributes) row.append(Object.assign(document.createElement("span"), { className: "attributes", textContent: attributes }));
      if (text) row.append(Object.assign(document.createElement("span"), { className: "text", textContent: text }));
      rows.set(row, el);
      li.append(row);
      if (el.children.length && !["template", "script", "style", "svg"].includes(el.localName)) {
        const group = document.createElement("ul");
        group.role = "group";
        group.append(...build(el, depth + 1));
        li.setAttribute("aria-expanded", "true");
        li.append(group);
      }
      items.push(li);
    }
    return items;
  };
  const hadFocus = tree.contains(document.activeElement) || document.activeElement === tree;
  tree.replaceChildren(...build(project.body, 1));
  tree.classList.toggle("empty", !project.body.children.length);
  tree.tabIndex = selected ? -1 : 0; // the selected row is the tab stop when there is one
  if (hadFocus) (tree.querySelector('[aria-selected="true"] > .row') ?? tree).focus();

  const rowOf = (event) => event.target.closest?.(".row");
  const positionIn = (row, event) => {
    const box = row.getBoundingClientRect();
    const y = (event.clientY - box.top) / box.height;
    return y < 0.25 ? "before" : y > 0.75 ? "after" : "inside";
  };
  const clearMarks = () => tree.querySelectorAll("[data-drop]").forEach((r) => r.removeAttribute("data-drop"));

  // ↑/↓ move the selection through the visible rows; Home/End jump.
  tree.onkeydown = (event) => {
    const all = [...tree.querySelectorAll(".row")];
    if (!all.length || event.altKey || event.ctrlKey || event.metaKey) return;
    const current = all.findIndex((r) => rows.get(r) === selected);
    const next = { ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: all.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const row = all[Math.max(0, Math.min(all.length - 1, current < 0 ? 0 : next))];
    onSelect(rows.get(row));
  };
  tree.onclick = (event) => {
    const row = rowOf(event);
    onSelect(row ? rows.get(row) : null);
  };
  tree.ondragstart = (event) => {
    const row = rowOf(event);
    if (!row) return;
    event.dataTransfer.setData(MOVE_TYPE, JSON.stringify(project.pathOf(rows.get(row))));
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
    onDrop(html ? { html } : { path: JSON.parse(move) }, row ? rows.get(row) : null, row ? positionIn(row, event) : "inside");
  };
  return rows;
}
