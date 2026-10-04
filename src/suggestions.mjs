// What the New dialog suggests: plain links to libraries and pages
// elsewhere. Nothing else in the editor knows about them; add or remove
// entries freely.

/** Packages offered as libraries (a package URL or npm name each). */
export const LIBRARIES = [
  { name: "domkit", spec: "https://cdn.jsdelivr.net/gh/johnhenry/domkit@6b06f9ae97fde22c367107f0c3c8967ed79c889e/" },
  { name: "pixelable", spec: "https://cdn.jsdelivr.net/gh/johnhenry/pixelable@869ee5f4af8f7bbfeb24ea481f2843835800f849/" },
  { name: "forsnaken", spec: "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@96578a5ea5be48d0f5dabf9ed5f9a10e85809ee5/" },
];

/** Pages offered as starting points. */
export const PAGES = [
  { name: "Forsnaken: the snake game, with its libraries and pieces", url: "https://cdn.jsdelivr.net/gh/johnhenry/forsnaken@96578a5ea5be48d0f5dabf9ed5f9a10e85809ee5/builder.html" },
];
