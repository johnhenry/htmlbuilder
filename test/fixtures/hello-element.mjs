// A component without a library, for the "components from a URL" tests.
export class HelloElement extends HTMLElement {
  connectedCallback() {
    this.textContent = `Hello, ${this.getAttribute("name") ?? "world"}!`;
  }
}
export default HelloElement;
