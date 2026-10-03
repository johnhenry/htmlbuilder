// What the New dialog suggests: plain links to libraries and pages
// elsewhere. Nothing else in the editor knows about them; add or remove
// entries freely.

/** Packages offered as libraries (a package URL or npm name each). */
export const LIBRARIES = [
  { name: "domkit", spec: "https://cdn.jsdelivr.net/gh/johnhenry/domkit@e7cfc1ce246fcdb88f194f87ae03bb3e28d2f11e/" },
  { name: "forsnaken", spec: "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@6b410c09cfe6c094e1bb33e530256122928e7de1/" },
];

/** Pages offered as starting points. */
export const PAGES = [
  { name: "Forsnaken: the snake game, with its libraries and pieces", url: "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@6b410c09cfe6c094e1bb33e530256122928e7de1/builder.html" },
];
