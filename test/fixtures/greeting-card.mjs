// A library with no manifest, for the "defined in the page" tests: it
// registers itself, and htmlbuilder learns its attributes from the class.
customElements.define(
  "greeting-card",
  class extends HTMLElement {
    static observedAttributes = ["greeting", "name"];
    connectedCallback() {
      this.attributeChangedCallback();
    }
    attributeChangedCallback() {
      this.textContent = `${this.getAttribute("greeting") ?? "Hello"}, ${this.getAttribute("name") ?? "world"}!`;
    }
  },
);
