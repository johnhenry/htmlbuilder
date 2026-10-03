// Live editing, the editor's side: what the preview has, and the patch
// that brings it up to date. The preview's side is preview-runtime.mjs.
//
// Each element is described by its tag, its attributes, and its children
// (element ids and runs of text); a patch carries the elements whose
// description changed. A change the preview can't take as a patch (a
// <script> added or changed) asks for a reload instead, as does anything
// in the head but the CSS and title (see `reloadKey`).

const RAW = new Set(["style", "pre", "textarea", "template"]); // contents sent as markup

/**
 * The page as the preview should have it.
 * @param {import("./project.mjs").Project} project
 * @returns {{ order: number[], tags: string[], elements: Map<number, object> }}
 *   `order`/`tags`: the elements' ids and tags in document order
 */
export function describe(project) {
  const elements = new Map();
  const order = [];
  const tags = [];
  const children = (el) =>
    [...el.childNodes].flatMap((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) return [project.idOf(node)];
      if (node.nodeType === Node.TEXT_NODE && node.data.trim()) return [{ text: node.data }];
      return [];
    });
  elements.set(0, { id: 0, children: children(project.body) });
  for (const el of project.body.querySelectorAll("*")) {
    const id = project.idOf(el);
    order.push(id);
    tags.push(el.localName);
    const entry = { id, tag: el.localName, ns: el.namespaceURI, attributes: [...el.attributes].map((a) => [a.name, a.value]) };
    if (el.localName === "script") entry.script = el.outerHTML;
    else if (RAW.has(el.localName)) entry.raw = el.innerHTML;
    else entry.children = children(el);
    elements.set(id, entry);
  }
  return { order, tags, elements };
}

/**
 * What changed between two descriptions, as patch operations; null if the
 * preview should reload instead.
 * @param {ReturnType<typeof describe>} before
 * @param {ReturnType<typeof describe>} after
 */
export function diff(before, after) {
  const ops = [];
  // Removing a script doesn't undo what it did: reload.
  for (const [id, entry] of before.elements) if (entry.script && !after.elements.has(id)) return null;
  for (const [id, entry] of after.elements) {
    const old = before.elements.get(id);
    if (old && JSON.stringify(old) === JSON.stringify(entry)) continue;
    if (entry.script) return null; // a script runs when it's inserted: reload instead
    const { script, ...op } = entry;
    ops.push(op);
  }
  return ops;
}

/** Everything that, when it changes, needs a fresh preview. @param {import("./project.mjs").Project} project */
export const reloadKey = (project) =>
  JSON.stringify([project.libraries, project.definitions, project.base, project.previewSameOrigin]);
