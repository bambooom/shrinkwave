import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { manifest, type Browser } from "./src/manifest";

const root = fileURLToPath(new URL(".", import.meta.url));
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };

function emitManifest(browser: Browser): Plugin {
  return {
    name: "emit-manifest",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: `${JSON.stringify(manifest(browser, version), null, 2)}\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const browser: Browser = mode === "firefox" ? "firefox" : "chrome";

  return {
    base: "./",
    plugins: [emitManifest(browser)],
    build: {
      outDir: browser === "firefox" ? "dist-firefox" : "dist",
      emptyOutDir: true,
      rollupOptions: {
        input: {
          app: resolve(root, "index.html"),
          background: resolve(root, "src/background.ts"),
        },
        output: {
          entryFileNames: (chunk) =>
            chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
        },
      },
    },
    worker: {
      format: "es",
    },
  };
});
