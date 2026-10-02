// The preview: the project, running in a sandboxed iframe (scripts on, no
// access to the editor). It's replaced from the project's HTML after each
// change, so it's always exactly what Download gives you.

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
    show(html, { now = false } = {}) {
      clearTimeout(timer);
      const update = () => {
        if (frame.srcdoc !== html) frame.srcdoc = html;
      };
      if (now) update();
      else timer = setTimeout(update, 150);
    },
  };
}
