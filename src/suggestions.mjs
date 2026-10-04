// What the New dialog suggests: plain links to libraries and pages
// elsewhere. Nothing else in the editor knows about them; add or remove
// entries freely.

/** Packages offered as libraries (a package URL or npm name each). */
export const LIBRARIES = [
  { name: "domkit", spec: "https://cdn.jsdelivr.net/gh/johnhenry/domkit@86b39db7a6d2807efed30a77cb295e72e6289c94/" },
  { name: "canvas-fx", spec: "https://cdn.jsdelivr.net/gh/johnhenry/canvas-fx@6813d7555865f4bf2da2d3928f544f4e33463baf/" },
  { name: "forsnaken", spec: "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@d067e559bec937ae2248fd084e3387df85276d0c/" },
];

/** Pages offered as starting points. */
export const PAGES = [
  { name: "Forsnaken: the snake game, with its libraries and pieces", url: "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@d067e559bec937ae2248fd084e3387df85276d0c/builder.html" },
];
