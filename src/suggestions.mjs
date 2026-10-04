// What the New dialog suggests: plain links to libraries and pages
// elsewhere. Nothing else in the editor knows about them; add or remove
// entries freely.

/** Packages offered as libraries (a package URL or npm name each). */
export const LIBRARIES = [
  { name: "domkit", spec: "https://cdn.jsdelivr.net/gh/johnhenry/domkit@86b39db7a6d2807efed30a77cb295e72e6289c94/" },
  { name: "canvas-fx", spec: "https://cdn.jsdelivr.net/gh/johnhenry/canvas-fx@af0b50414a9bdbfe9daaa26752d9792a3ee9712e/" },
  { name: "forsnaken", spec: "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@c2bf2f156c3a31f90931c432fab8f613967f7c56/" },
];

/** Pages offered as starting points. */
export const PAGES = [
  { name: "Forsnaken: the snake game, with its libraries and pieces", url: "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@c2bf2f156c3a31f90931c432fab8f613967f7c56/builder.html" },
];
