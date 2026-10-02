// The palette: snippets saved in the project, the custom elements its
// libraries' manifests describe, and plain HTML. Drag an entry into the
// outline, or click it to add it inside the selected element.
import { describeAll } from "./manifests.mjs";
import BASICS from "./html-basics.mjs";

export const NEW_TYPE = "application/x-htmlbuilder-new";

/**
 * @param {HTMLElement} container
 * @param {{ project: import("./project.mjs").Project, onAdd: (html: string) => void, filter?: string }} options
 */
export async function renderPalette(container, { project, onAdd, filter = "" }) {
  const elements = await describeAll(project.libraries);
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
    ["HTML", BASICS.map(([tag, html]) => ({ label: `<${tag}>`, html, title: html }))],
  ];
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
