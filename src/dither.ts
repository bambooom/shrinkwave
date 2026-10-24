// 2×2 ordered-dither masks: 25%, 50%, 75% coverage of the next color.
const levels = [
  [[0, 0]],
  [
    [0, 0],
    [1, 1],
  ],
  [
    [0, 0],
    [1, 1],
    [1, 0],
  ],
];

/**
 * Builds a CSS `url()` with a banded, ordered-dithered gradient.
 * Each segment is split into fifths: solid, 25%, 50%, 75%, solid next color.
 * Patterns use user-space pixels, so cells stay square at any element size.
 */
export function ditherGradient(colors: string[], { cell = 2, vertical = false } = {}) {
  const tile = cell * 2;
  const segment = 100 / (colors.length - 1);
  const part = segment / 5;
  const band = (start: number, size: number, fill: string) =>
    vertical
      ? `<rect y="${start}%" width="100%" height="${size}%" fill="${fill}"/>`
      : `<rect x="${start}%" width="${size}%" height="100%" fill="${fill}"/>`;

  let defs = "";
  let body = "";
  colors.slice(1).forEach((next, index) => {
    const start = index * segment;
    body += band(start, segment, colors[index]);
    levels.forEach((cells, level) => {
      const id = `d${index}-${level}`;
      const dots = cells
        .map(([x, y]) => `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="${next}"/>`)
        .join("");
      defs += `<pattern id="${id}" width="${tile}" height="${tile}" patternUnits="userSpaceOnUse">${dots}</pattern>`;
      body += band(start + part * (level + 1), part, `url(#${id})`);
    });
    body += band(start + part * 4, part, next);
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" shape-rendering="crispEdges"><defs>${defs}</defs>${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
