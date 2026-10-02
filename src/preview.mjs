// The preview: the project, running in a sandboxed iframe (scripts on, no
// access to the editor). It's replaced from the project's HTML after each
// change, so it's always exactly what Download gives you.
//
// Sandboxed without same-origin, its module scripts are cross-origin
// requests that need CORS headers. For libraries on a local server that
// doesn't send them, a project can opt into `sameOrigin`, which also lets
// the page reach the editor: only for code you trust.
const SANDBOX = "allow-scripts allow-modals allow-pointer-lock allow-popups";

/**
 * @param {HTMLIFrameElement} frame
 * @param {(path: number[]) => void} onSelect called on Alt-click in the preview
 */
export function connectPreview(frame, onSelect) {
  let timer = 0;
  addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow || event.data?.htmlbuilder !== "select") return;
    onSelect(event.data.path);
  });
  return {
    /** @param {string} html */
    show(html, { now = false, sameOrigin = false } = {}) {
      clearTimeout(timer);
      const sandbox = sameOrigin ? `${SANDBOX} allow-same-origin` : SANDBOX;
      const update = () => {
        if (frame.getAttribute("sandbox") !== sandbox) {
          // A sandbox change applies to the next document: load it again.
          frame.setAttribute("sandbox", sandbox);
          frame.srcdoc = "";
        }
        if (frame.srcdoc !== html) frame.srcdoc = html;
      };
      if (now) update();
      else timer = setTimeout(update, 150);
    },
  };
}
