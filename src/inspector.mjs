// The inspector: the selected element's attributes (typed fields for the
// ones its manifest describes, free-form rows for the rest) and text.
import { fieldFor } from "./manifests.mjs";

/**
 * @param {HTMLElement} container
 * @param {{ element: Element | null, info?: import("./manifests.mjs").ElementInfo, onAttribute: (name: string, value: string | null, rename?: string) => void, onText: (text: string) => void, onAction: (action: string) => void }} options
 */
export function renderInspector(container, { element, info, onAttribute, onText, onAction }) {
  if (!element) {
    container.replaceChildren(Object.assign(document.createElement("p"), { className: "hint", textContent: "Select an element in the outline, or Alt-click it in the preview." }));
    return;
  }
  const form = document.createElement("form");
  form.onsubmit = (event) => event.preventDefault();
  const heading = Object.assign(document.createElement("h2"), { textContent: `<${element.localName}>` });
  form.append(heading);
  if (info?.summary) form.append(Object.assign(document.createElement("p"), { className: "summary", textContent: info.summary }));

  const known = new Map((info?.attributes ?? []).map((a) => [a.name, a]));
  const fields = document.createElement("div");
  fields.className = "fields";
  const add = (label, control, description) => {
    const id = `field-${Math.random().toString(36).slice(2)}`;
    control.id = id;
    const l = Object.assign(document.createElement("label"), { htmlFor: id, textContent: label });
    if (description) l.title = description;
    fields.append(l, control);
  };
  // Described attributes, typed.
  for (const attribute of known.values()) {
    const value = element.getAttribute(attribute.name);
    const { kind, choices } = fieldFor(attribute.type);
    let control;
    if (kind === "boolean") {
      control = Object.assign(document.createElement("input"), { type: "checkbox", checked: value !== null });
      control.onchange = () => onAttribute(attribute.name, control.checked ? "" : null);
    } else if (kind === "choice") {
      control = document.createElement("select");
      control.append(new Option("", ""), ...choices.map((c) => new Option(c, c)));
      control.value = value ?? "";
      control.onchange = () => onAttribute(attribute.name, control.value || null);
    } else {
      control = Object.assign(document.createElement("input"), { type: kind === "number" ? "number" : "text", value: value ?? "", placeholder: attribute.type });
      control.onchange = () => onAttribute(attribute.name, control.value === "" ? null : control.value);
    }
    add(attribute.name, control, attribute.description);
  }
  form.append(fields);

  // Every other attribute: editable name and value.
  const others = document.createElement("div");
  others.className = "attributes";
  const row = (name = "", value = "") => {
    const n = Object.assign(document.createElement("input"), { value: name, placeholder: "name", ariaLabel: "Attribute name" });
    const v = Object.assign(document.createElement("input"), { value, placeholder: "value", ariaLabel: `Value of ${name || "new attribute"}` });
    const remove = Object.assign(document.createElement("button"), { type: "button", textContent: "×", title: "Remove attribute", ariaLabel: `Remove ${name}` });
    // An existing attribute is renamed as soon as its name changes; a new
    // one is added once it has a name and you leave the value (or press
    // Enter), so typing the name doesn't commit it half-made.
    n.onchange = () => {
      if (name && n.value.trim()) onAttribute(n.value.trim(), v.value, name);
    };
    v.onchange = () => n.value.trim() && onAttribute(n.value.trim(), v.value, name && name !== n.value.trim() ? name : undefined);
    remove.onclick = () => name && onAttribute(name, null);
    others.append(n, v, remove);
  };
  for (const a of element.attributes) if (!known.has(a.name)) row(a.name, a.value);
  row();
  form.append(Object.assign(document.createElement("h3"), { textContent: "Attributes" }), others);

  // Text, for elements that hold only text.
  if (!element.children.length && !["img", "input", "br", "hr", "meta", "link"].includes(element.localName)) {
    const text = Object.assign(document.createElement("textarea"), { value: element.textContent, rows: 2, ariaLabel: "Text" });
    text.onchange = () => onText(text.value);
    form.append(Object.assign(document.createElement("h3"), { textContent: "Text" }), text);
  }

  const actions = document.createElement("div");
  actions.className = "actions";
  for (const [action, label] of [["duplicate", "Duplicate"], ["snippet", "Save as snippet"], ["delete", "Delete"]]) {
    const button = Object.assign(document.createElement("button"), { type: "button", textContent: label });
    button.onclick = () => onAction(action);
    actions.append(button);
  }
  form.append(actions);
  container.replaceChildren(form);
}
