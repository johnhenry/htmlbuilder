// What the New dialog suggests: plain links to libraries and pages
// elsewhere. Nothing else in the editor knows about them; add or remove
// entries freely.

/** Packages offered as libraries (a package URL or npm name each). */
export const LIBRARIES = [
  { name: "domkit", spec: "https://cdn.jsdelivr.net/gh/johnhenry/domkit@8356a92f6b1c15205fcc1ca6d6d80ceffddd6386/" },
  { name: "forsnaken", spec: "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@b414864d6c6d9685c143f978a263681acf908ae2/" },
];

/** Pages offered as starting points. */
export const PAGES = [
  { name: "Forsnaken: the snake game, with its libraries and pieces", url: "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@b414864d6c6d9685c143f978a263681acf908ae2/builder.html" },
];
