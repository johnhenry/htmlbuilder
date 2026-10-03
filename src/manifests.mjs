// What the palette and inspector know about custom elements: read from
// each library's custom-elements.json (https://github.com/webcomponents/custom-elements-manifest),
// including which module registers each tag (a `custom-element-definition`
// export), so dropping an element can load just that module. Libraries
// are found from a package URL through package.json's `customElements`.

const cache = new Map(); // url -> Promise<Map<tag, info>>

/**
 * @typedef {{ tag: string, summary: string, attributes: { name: string, type: string, description: string }[], definition?: string, library?: string }} ElementInfo
 *   `definition`: the URL of the module that registers the tag, if the manifest says.
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
          const definitions = new Map(); // tag -> module URL
          for (const module of manifest.modules ?? []) {
            for (const e of module.exports ?? []) {
              if (e.kind === "custom-element-definition" && e.name?.includes("-")) definitions.set(e.name, new URL(module.path, url).href);
            }
          }
          for (const module of manifest.modules ?? []) {
            for (const d of module.declarations ?? []) {
              if (!d.customElement || !d.tagName || !d.tagName.includes("-")) continue;
              elements.set(d.tagName, {
                tag: d.tagName,
                summary: d.summary ?? d.description ?? "",
                attributes: (d.attributes ?? []).map((a) => ({ name: a.name, type: a.type?.text ?? "string", description: a.description ?? "" })),
                definition: definitions.get(d.tagName),
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
 * Everything every library's manifest says, by tag. Relative manifest URLs
 * resolve against `base` (where the project came from).
 * @param {{ name: string, manifest: string }[]} libraries
 * @param {string} [base]
 * @returns {Promise<Map<string, ElementInfo>>}
 */
export async function describeAll(libraries, base = location.href) {
  const all = new Map();
  for (const library of libraries) {
    if (!library.manifest) continue;
    let url;
    try {
      url = new URL(library.manifest, base).href;
    } catch {
      continue;
    }
    for (const [tag, info] of await loadManifest(url)) all.set(tag, { ...info, library: library.name });
  }
  return all;
}

/**
 * A library from a package: its package.json names it and points to its
 * manifest (`customElements`, the manifest format's convention). With no
 * manifest, or one that doesn't say which modules register its tags, the
 * package's entry point is loaded instead.
 * `spec` is a package URL (https://cdn.jsdelivr.net/gh/user/repo@commit/),
 * or an npm name (@scope/name@version), fetched from jsDelivr.
 * @param {string} spec
 * @returns {Promise<{ name: string, modules: string[], manifest: string }>}
 */
export async function libraryFromPackage(spec) {
  const text = spec.trim();
  let root = /^(https?:|\.{0,2}\/)/.test(text) ? new URL(text, location.href).href : `https://cdn.jsdelivr.net/npm/${text}`;
  root = root.replace(/\/?(package\.json)?$/, "/");
  const response = await fetch(new URL("package.json", root));
  if (!response.ok) throw new Error(`No package.json at ${root} (${response.status})`);
  const pkg = await response.json();
  const name = (pkg.name ?? new URL(root).pathname.split("/").filter(Boolean).at(-1) ?? "library").replace(/^@[^/]+\//, "");
  const manifest = pkg.customElements ? new URL(pkg.customElements, root).href : "";
  const described = manifest ? await loadManifest(manifest) : new Map();
  const defined = [...described.values()].some((info) => info.definition);
  const entry = typeof pkg.exports === "string" ? pkg.exports : pkg.exports?.["."]?.default ?? pkg.exports?.["."] ?? pkg.module ?? pkg.main;
  // Modules that register tags are added as their elements are used.
  const modules = !defined && typeof entry === "string" ? [new URL(entry, root).href] : [];
  return { name, modules, manifest };
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
