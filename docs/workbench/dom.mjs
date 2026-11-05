const NS = "http://www.w3.org/2000/svg";
const PATHS = {
  cube: ["M12 2 22 7v10l-10 5L2 17V7Z", "M2 7l10 5 10-5M12 12v10M12 2v10"],
  home: ["m3 10 9-7 9 7v11h-6v-7H9v7H3Z"],
  layers: ["m12 3 10 5-10 5L2 8Z", "m2 12 10 5 10-5M2 16l10 5 10-5"],
  check: [
    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
    "m7 12 3 3 7-7",
  ],
  note: [
    "M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7",
    "m16 3 5 5-9 9-6 1 1-6Z",
  ],
  flask: ["M9 3h6M10 3v7L4 20a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1l-6-10V3M7 15h10"],
  chart: ["M3 3v18h18M6 15l5-6 4 3 6-8M17 4h4v4"],
  spark: ["m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"],
  code: ["m7 5-6 7 6 7M17 5l6 7-6 7M14 3l-4 18"],
  learn: ["m2 8 10-5 10 5-10 5Z", "M6 10v8q6 5 12 0v-8M22 8v9"],
  people: [
    "M9 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM17 4a3 3 0 0 1 0 6M2 21v-4a6 6 0 0 1 12 0v4M18 13a5 5 0 0 1 4 5v3",
  ],
  document: ["M5 2h9l5 5v15H5ZM14 2v6h5M8 12h8M8 16h8"],
  plus: ["M12 4v16M4 12h16"],
  close: ["m6 6 12 12M6 18 18 6"],
  "arrow-right": ["M4 12h16m-6-6 6 6-6 6"],
  calendar: ["M4 5h16v16H4ZM8 2v6M16 2v6M4 10h16M8 14h2M14 14h2M8 17h2"],
  link: [
    "m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0",
  ],
  clock: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 6v7l5 2"],
  braces: [
    "M8 3H6a2 2 0 0 0-2 2v4l-2 3 2 3v4a2 2 0 0 0 2 2h2M16 3h2a2 2 0 0 1 2 2v4l2 3-2 3v4a2 2 0 0 1-2 2h-2",
  ],
  play: ["m8 4 12 8-12 8Z"],
  pause: ["M8 4v16M16 4v16"],
  stop: ["M6 6h12v12H6Z"],
  sliders: ["M4 6h16M4 18h16M8 3v6M16 15v6"],
  settings: [
    "m9 2-1 4-4 1-2 4 3 3v4l4 2 3-2 4 2 4-2v-4l3-3-2-4-4-1-1-4Z",
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  ],
  download: ["M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"],
  upload: ["M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"],
  lock: ["M5 10h14v11H5ZM8 10V6a4 4 0 0 1 8 0v4M12 14v3"],
  search: ["M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM16 16l6 6"],
  return: ["M20 5v9H4m5-5-5 5 5 5"],
  filter: ["M3 4h18l-7 8v7l-4 2v-9Z"],
  edit: ["m16 3 5 5-11 11-6 1 1-6ZM14 5l5 5"],
  github: [
    "M9 19c-5 2-5-3-7-3M16 22v-4a4 4 0 0 0-1-3c4 0 6-2 6-6a5 5 0 0 0-2-4c1-2 0-4 0-4-2 0-4 2-4 2a13 13 0 0 0-6 0S7 1 5 1c0 0-1 2 0 4a5 5 0 0 0-2 4c0 4 2 6 6 6a4 4 0 0 0-1 3v4",
  ],
  swirl: [
    "M12 3a5 5 0 0 1 8 5 5 5 0 0 1 0 9 5 5 0 0 1-8 4 5 5 0 0 1-8-5 5 5 0 0 1 0-9 5 5 0 0 1 8-4Z",
    "m12 6 6 4v7l-6 3-6-4V9ZM6 9l6 4 6-3M12 13v7",
  ],
};

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function icon(name) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  for (const d of PATHS[name] || PATHS.document) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}
