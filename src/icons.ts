import { brandPalette, brandRows } from "./brand";

const palette: Record<string, string> = {
  k: "#05020f",
  m: "#ff2a9d",
  c: "#2de2e6",
  y: "#ffd23f",
  o: "#ff9f45",
  p: "#7b2ff7",
  g: "#b9a8ff",
  w: "#f6efff",
};

function pixelArt(rows: string[], colors = palette) {
  const width = Math.max(...rows.map((row) => row.length));
  let rects = "";
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const color = colors[row[x]];
      let run = 1;
      while (row[x + run] === row[x]) run++;
      if (color) rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${color}"/>`;
      x += run;
    }
  });

  return (size: number) =>
    `<svg class="pixel-icon" viewBox="0 0 ${width} ${rows.length}" width="${size}" height="${Math.round((size * rows.length) / width)}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

export const icons = {
  brand: pixelArt(brandRows, brandPalette),
  floppy: pixelArt([
    "kkkkkkkkkkkkkkk.",
    "kmmmggggggggmmmk",
    "kmmmggkkggggmmmk",
    "kmmmggkkggggmmmk",
    "kmmmggggggggmmmk",
    "kmmmmmmmmmmmmmmk",
    "kmmmmmmmmmmmmmmk",
    "kmmwwwwwwwwwwmmk",
    "kmmwkkkkkkkkwmmk",
    "kmmwwwwwwwwwwmmk",
    "kmmwkkkkkkwwwmmk",
    "kmmwwwwwwwwwwmmk",
    "kmmwwwwwwwwwwmmk",
    "kmmwwwwwwwwwwmmk",
    "kmmwwwwwwwwwwmmk",
    "kkkkkkkkkkkkkkkk",
  ]),
  stitch: pixelArt([
    "kkkkkkkkkkkkkkkk",
    "kccccccccccyyyck",
    "kccccccccccyyyck",
    "kcccccmcccccccck",
    "kccccmmmccccccck",
    "kcccmmmmmcccmcck",
    "kccmmmmmmmcmmmck",
    "kkkkkkkkkkkkkkkk",
    "kyykkyykkyykkyyk",
    "kkkkkkkkkkkkkkkk",
    "kmmmmmmmmmmmwwmk",
    "kmmmmmmmmmmmwwmk",
    "kmmmmmcmmmmmmmmk",
    "kmmmmcccmmmmmmmk",
    "kmmmcccccmmmcmmk",
    "kkkkkkkkkkkkkkkk",
  ]),
  folder: pixelArt([
    "................",
    "................",
    ".kkkkkk.........",
    "koooooook.......",
    "kooooooookkkkkkk",
    "kyyyyyyyyyyyyyyk",
    "kyyyyyyyyyyyyyyk",
    "kyyyyyyyyyyyyyyk",
    "kyyyyyyyyyyyyyyk",
    "kyyyyyyyyyyyyyyk",
    "kyyyyyyyyyyyyyyk",
    "kyyyyyyyyyyyyyyk",
    "kyyyyyyyyyyyyyyk",
    "kkkkkkkkkkkkkkkk",
    "................",
    "................",
  ]),
  file: pixelArt([
    "kkkkkkk...",
    "kwwwwwkk..",
    "kwwwwwkwk.",
    "kwwwwwkkkk",
    "kwwwwwwwwk",
    "kwmmmmmmwk",
    "kwwwwwwwwk",
    "kwccccccwk",
    "kwwwwwwwwk",
    "kwmmmmwwwk",
    "kwwwwwwwwk",
    "kkkkkkkkkk",
  ]),
  vertical: pixelArt([
    ".kkkkkkkkkkkkkk.",
    ".kmmmmmmmmmmmmk.",
    ".kmmmmmmmmmmmmk.",
    ".kmmmmmmmmmmmmk.",
    ".kmmmmmmmmmmmmk.",
    ".kmmmmmmmmmmmmk.",
    ".kkkkkkkkkkkkkk.",
    "................",
    ".kkkkkkkkkkkkkk.",
    ".kcccccccccccck.",
    ".kcccccccccccck.",
    ".kcccccccccccck.",
    ".kcccccccccccck.",
    ".kcccccccccccck.",
    ".kcccccccccccck.",
    ".kkkkkkkkkkkkkk.",
  ]),
  horizontal: pixelArt([
    "................",
    "................",
    "kkkkkkk.kkkkkkkk",
    "kmmmmmk.kcccccck",
    "kmmmmmk.kcccccck",
    "kmmmmmk.kcccccck",
    "kmmmmmk.kcccccck",
    "kmmmmmk.kcccccck",
    "kmmmmmk.kcccccck",
    "kmmmmmk.kcccccck",
    "kmmmmmk.kcccccck",
    "kmmmmmk.kcccccck",
    "kmmmmmk.kcccccck",
    "kkkkkkk.kkkkkkkk",
    "................",
    "................",
  ]),
};
