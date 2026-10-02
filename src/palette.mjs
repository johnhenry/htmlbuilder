// The palette: snippets saved in the project, the custom elements its
// libraries' manifests describe, elements the page defined that no
// manifest describes, and plain HTML. Drag an entry into the
// outline, or click it to add it inside the selected element.
import BASICS from "./html-basics.mjs";

export const NEW_TYPE = "application/x-htmlbuilder-new";
const shown = new WeakMap(); // container -> what it shows

/**
 * @param {HTMLElement} container
 * @param {{ project: import("./project.mjs").Project, catalog: Map<string, import("./manifests.mjs").ElementInfo>, defined?: Map<string, string[]>, onAdd: (html: string) => void, filter?: string }} options
 */
export function renderPalette(container, { project, catalog: elements, defined = new Map(), onAdd, filter = "" }) {
  const components = new Set(project.definitions.map((d) => d.tag));
  const undescribed = [...defined.keys()].filter((tag) => !elements.has(tag) && !components.has(tag)).sort();
  const needle = filter.trim().toLowerCase();
  const matches = (text) => !needle || text.toLowerCase().includes(needle);
  const groups = [
    ["Snippets", project.snippets.map((s) => ({ label: s.name, html: s.html, title: s.html }))],
    ["Components", project.definitions.filter((d) => d.tag).map((d) => ({ label: `<${d.tag}>`, html: `<${d.tag}></${d.tag}>`, title: d.src }))],
    ...Object.entries(
      [...elements.values()].reduce((byLibrary, info) => {
        (byLibrary[info.library] ??= []).push({ label: `<${info.tag}>`, html: `<${info.tag}></${info.tag}>`, title: info.summary });
        return byLibrary;
      }, {}),
    ),
    ["Defined in the page", undescribed.map((tag) => ({ label: `<${tag}>`, html: `<${tag}></${tag}>`, title: "Defined by a library with no manifest" }))],
    ["HTML", BASICS.map(([tag, html]) => ({ label: `<${tag}>`, html, title: html }))],
  ];
  // Unchanged entries are left alone (rebuilding them would cancel a drag
  // that started from one).
  const signature = JSON.stringify(groups.map(([name, items]) => [name, items.filter((i) => matches(i.label) || matches(i.title ?? ""))]));
  if (shown.get(container) === signature) return;
  shown.set(container, signature);
  const fragment = document.createDocumentFragment();
  for (const [name, items] of groups) {
    const shown = items.filter((item) => matches(item.label) || matches(item.title ?? ""));
    if (!shown.length) continue;
    const heading = document.createElement("h3");
    heading.textContent = name;
    const list = document.createElement("ul");
    for (const item of shown) {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.label;
      button.title = item.title ?? "";
      button.draggable = true;
      button.dataset.html = item.html;
      button.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData(NEW_TYPE, item.html);
        event.dataTransfer.setData("text/plain", item.html);
        event.dataTransfer.effectAllowed = "copy";
      });
      button.addEventListener("click", () => onAdd(item.html));
      li.append(button);
      list.append(li);
    }
    fragment.append(heading, list);
  }
  container.replaceChildren(fragment);
}
