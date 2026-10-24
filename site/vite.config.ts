import { cpSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { defineConfig, type Plugin } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };

// Edge installs the Chrome package, so only two archives are needed.
const packages = [
  { id: "chrome", dir: resolve(root, "dist"), file: `shrinkwave-chrome-${version}.zip`, script: "build" },
  { id: "firefox", dir: resolve(root, "dist-firefox"), file: `shrinkwave-firefox-${version}.zip`, script: "build:firefox" },
];
const demoDir = packages[0].dir;
const ignored = new Set([".DS_Store"]);

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (ignored.has(name)) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

function zipDir(dir: string) {
  const files: Record<string, Uint8Array> = {};
  for (const path of listFiles(dir)) files[relative(dir, path).split(sep).join("/")] = readFileSync(path);
  return zipSync(files, { level: 9 });
}

function builtVersion(dir: string) {
  const path = join(dir, "manifest.json");
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as { version: string }).version : undefined;
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

const mimeTypes: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".zip": "application/zip",
};

/**
 * Bundles the built extensions into the site: zipped packages under
 * `downloads/` and the Chrome build under `app/` for the live demo.
 */
function extensionPackages(): Plugin {
  const archives = new Map<string, Uint8Array>();

  const archive = (pkg: (typeof packages)[number]) => {
    let zip = archives.get(pkg.id);
    if (!zip && builtVersion(pkg.dir) === version) archives.set(pkg.id, (zip = zipDir(pkg.dir)));
    return zip;
  };

  let outDir = "";
  let isBuild = false;

  return {
    name: "extension-packages",
    configResolved(config) {
      outDir = config.build.outDir;
      isBuild = config.command === "build";
    },
    buildStart() {
      if (!isBuild) return;
      for (const pkg of packages) {
        const built = builtVersion(pkg.dir);
        if (built !== version) {
          this.error(`${relative(root, pkg.dir)}/ is ${built ? `v${built}` : "missing"}, expected v${version}. Run \`npm run ${pkg.script}\` first.`);
        }
        archive(pkg);
      }
    },
    transformIndexHtml(html) {
      let result = html.replaceAll("{{version}}", version);
      for (const pkg of packages) {
        const zip = archive(pkg);
        result = result.replaceAll(`{{size:${pkg.id}}}`, zip ? formatSize(zip.byteLength) : "—");
      }
      return result;
    },
    generateBundle() {
      for (const pkg of packages) {
        this.emitFile({ type: "asset", fileName: `downloads/${pkg.file}`, source: archive(pkg)! });
      }
    },
    writeBundle() {
      cpSync(demoDir, join(outDir, "app"), { recursive: true, filter: (path) => !ignored.has(path.split(sep).pop()!) });
    },
    configureServer(server) {
      // Serve the same /app/ and /downloads/ paths in dev, straight from the extension builds.
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
        let body: Uint8Array | undefined;
        let type = "";

        if (path.startsWith("/app/")) {
          const file = resolve(demoDir, `.${path.slice(4)}`);
          if (file.startsWith(demoDir + sep) && existsSync(file) && statSync(file).isFile()) {
            body = readFileSync(file);
            type = mimeTypes[extname(file)] ?? "application/octet-stream";
          }
        } else if (path.startsWith("/downloads/")) {
          const pkg = packages.find(({ file }) => path === `/downloads/${file}`);
          body = pkg && archive(pkg);
          type = mimeTypes[".zip"];
        }

        if (!body) return next();
        res.setHeader("Content-Type", type);
        res.end(body);
      });
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  publicDir: false,
  plugins: [extensionPackages()],
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
