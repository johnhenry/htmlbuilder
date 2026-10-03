// What the New dialog suggests: plain links to libraries and pages
// elsewhere. Nothing else in the editor knows about them; add or remove
// entries freely.

/** Packages offered as libraries (a package URL or npm name each). */
export const LIBRARIES = [
  { name: "domkit", spec: "https://cdn.jsdelivr.net/gh/johnhenry/domkit@8356a92f6b1c15205fcc1ca6d6d80ceffddd6386/" },
  { name: "forsnaken", spec: "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@bdce69946ee0c8ecdba5e7b152020a823d5be5e5/" },
];

/** Pages offered as starting points. */
export const PAGES = [
  { name: "Forsnaken: the snake game, with its libraries and pieces", url: "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@bdce69946ee0c8ecdba5e7b152020a823d5be5e5/builder.html" },
];
