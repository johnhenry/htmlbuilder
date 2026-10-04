// What the New dialog suggests: plain links to libraries and pages
// elsewhere. Nothing else in the editor knows about them; add or remove
// entries freely.

/** Packages offered as libraries (a package URL or npm name each). */
export const LIBRARIES = [
  { name: "domkit", spec: "https://cdn.jsdelivr.net/gh/johnhenry/domkit@86b39db7a6d2807efed30a77cb295e72e6289c94/" },
  { name: "pixelable", spec: "https://cdn.jsdelivr.net/gh/johnhenry/pixelable@73c544ab05ccedc3089dfee81a105f8539d5f944/" },
  { name: "forsnaken", spec: "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@7300b17a5c486b59b27800b67d48b0243fbd6289/" },
];

/** Pages offered as starting points. */
export const PAGES = [
  { name: "Forsnaken: the snake game, with its libraries and pieces", url: "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@7300b17a5c486b59b27800b67d48b0243fbd6289/builder.html" },
];
