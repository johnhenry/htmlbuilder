// The preview: the project, running in a sandboxed iframe (scripts on, no
// access to the editor). It's loaded from the project's HTML, which is
// exactly what Download gives you; after that, edits are patched into the
// running page (live.mjs, preview-runtime.mjs), so what's running keeps
// running. Changes a patch can't make reload it.
//
// Sandboxed without same-origin, its module scripts are cross-origin
// requests that need CORS headers. For libraries on a local server that
// doesn't send them, a project can opt into `sameOrigin`, which also lets
// the page reach the editor: only for code you trust.
const SANDBOX = "allow-scripts allow-modals allow-pointer-lock allow-popups";

/**
 * @param {HTMLIFrameElement} frame
 * @param {{
 *   onSelect: (id: number) => void,
 *   onDefined?: (elements: Record<string, string[]>) => void,
 *   onReady?: (token: number, tags: string[]) => void,
 * }} handlers `onSelect`: Alt-click in the preview; `onDefined`: the custom
 *   elements the page defined, with the attributes each observes; `onReady`:
 *   a load has run, and can take patches.
 */
export function connectPreview(frame, { onSelect, onDefined = () => {}, onReady = () => {} }) {
  let timer = 0;
  addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow) return;
    if (event.data?.htmlbuilder === "select") onSelect(event.data.id);
    if (event.data?.htmlbuilder === "defined") onDefined(event.data.elements ?? {});
    if (event.data?.htmlbuilder === "ready") onReady(event.data.token, event.data.tags ?? []);
  });
  return {
    /** Load the page afresh. @param {string} html */
    load(html, { now = false, sameOrigin = false } = {}) {
      clearTimeout(timer);
      const sandbox = sameOrigin ? `${SANDBOX} allow-same-origin` : SANDBOX;
      const update = () => {
        if (frame.getAttribute("sandbox") !== sandbox) {
          // A sandbox change applies to the next document: load it again.
          frame.setAttribute("sandbox", sandbox);
          frame.srcdoc = "";
        }
        frame.srcdoc = html;
      };
      if (now) update();
      else timer = setTimeout(update, 150);
    },
    /** Send the running page a message (a patch). */
    post(message) {
      frame.contentWindow?.postMessage(message, "*");
    },
  };
}
