// What the New dialog suggests: plain links to libraries and pages
// elsewhere. Nothing else in the editor knows about them; add or remove
// entries freely.

/** Packages offered as libraries (a package URL or npm name each). */
export const LIBRARIES = [
  { name: "domkit", spec: "https://cdn.jsdelivr.net/gh/johnhenry/domkit@6b06f9ae97fde22c367107f0c3c8967ed79c889e/" },
  { name: "forsnaken", spec: "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@c62e1a05274f7d0a1bc090fd219b691f3f64bdea/" },
];

/** Pages offered as starting points. */
export const PAGES = [
  { name: "Forsnaken: the snake game, with its libraries and pieces", url: "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@c62e1a05274f7d0a1bc090fd219b691f3f64bdea/builder.html" },
];
