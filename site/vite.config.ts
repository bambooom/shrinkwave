import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };

function templateValues(): Plugin {
  return {
    name: "template-values",
    transformIndexHtml: (html) => html.replaceAll("{{version}}", version),
  };
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  publicDir: false,
  plugins: [templateValues()],
  build: {
    outDir: resolve(root, "site-dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5181,
    fs: { allow: [root] },
  },
  preview: {
    port: 5181,
  },
});
