// What the palette and inspector know about custom elements: read from
// each library's custom-elements.json (https://github.com/webcomponents/custom-elements-manifest).

const cache = new Map(); // url -> Promise<Map<tag, info>>

/**
 * @typedef {{ tag: string, summary: string, attributes: { name: string, type: string, description: string }[] }} ElementInfo
 */

/**
 * The elements a manifest describes, by tag.
 * @param {string} url
 * @returns {Promise<Map<string, ElementInfo>>}
 */
export function loadManifest(url) {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url)
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`${response.status} ${url}`))))
        .then((manifest) => {
          const elements = new Map();
          for (const module of manifest.modules ?? []) {
            for (const d of module.declarations ?? []) {
              if (!d.customElement || !d.tagName || !d.tagName.includes("-")) continue;
              elements.set(d.tagName, {
                tag: d.tagName,
                summary: d.summary ?? d.description ?? "",
                attributes: (d.attributes ?? []).map((a) => ({ name: a.name, type: a.type?.text ?? "string", description: a.description ?? "" })),
              });
            }
          }
          return elements;
        })
        .catch(() => new Map()),
    );
  }
  return cache.get(url);
}

/**
 * Everything every library's manifest says, by tag.
 * @param {{ manifest: string }[]} libraries
 * @returns {Promise<Map<string, ElementInfo>>}
 */
export async function describeAll(libraries) {
  const all = new Map();
  for (const library of libraries) {
    if (!library.manifest) continue;
    for (const [tag, info] of await loadManifest(library.manifest)) all.set(tag, { ...info, library: library.name });
  }
  return all;
}

/**
 * The input to edit an attribute with, from its manifest type: a checkbox
 * for `boolean`, a number field, a menu for a union of strings, or text.
 * @param {string} type
 * @returns {{ kind: "boolean" | "number" | "choice" | "text", choices?: string[] }}
 */
export function fieldFor(type = "") {
  const text = type.trim();
  if (text === "boolean") return { kind: "boolean" };
  if (text === "number") return { kind: "number" };
  const choices = [...text.matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2]);
  if (choices.length > 1 && /^(\s*("[^"]*"|'[^']*')\s*\|?)+$/.test(text)) return { kind: "choice", choices };
  return { kind: "text" };
}
