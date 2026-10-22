import { zipSync } from "fflate";
import "./style.css";
import { CompressionPool } from "./pool";
import type { ImageJob, OutputFormat, Settings } from "./types";

const app = document.querySelector<HTMLElement>("#app")!;
const pool = new CompressionPool(2);
const state: { jobs: ImageJob[]; running: boolean; settings: Settings } = {
  jobs: [],
  running: false,
  settings: { format: "avif", quality: 65, maxDimension: 1600 },
};

const formatLabels: Record<OutputFormat, string> = {
  avif: "AVIF",
  webp: "WEBP",
  jpeg: "JPEG",
  png: "PNG",
};

function bytes(value?: number) {
  if (!value) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(2)} MB`;
}

function basename(name: string) {
  return name.replace(/\.[^/.]+$/, "");
}

function addFiles(files: FileList | File[]) {
  if (state.running) return;
  const accepted = Array.from(files).filter((file) => file.type.startsWith("image/"));
  state.jobs.push(
    ...accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      sourceSize: file.size,
      state: "queued" as const,
    })),
  );
  render();
}

function addClipboardImages(event: ClipboardEvent) {
  const images = Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item, index) => {
      const file = item.getAsFile();
      if (!file) return null;
      const extension = file.type.split("/")[1] || "png";
      return new File([file], file.name || `pasted-image-${Date.now()}-${index + 1}.${extension}`, {
        type: file.type,
      });
    })
    .filter((file): file is File => file !== null);

  if (!images.length) return;
  event.preventDefault();
  addFiles(images);
}

async function run() {
  if (state.running || state.jobs.every((job) => job.state === "done")) return;
  state.running = true;
  render();

  const pending = state.jobs.filter((job) => job.state === "queued" || job.state === "failed");
  await Promise.all(
    pending.map(async (job) => {
      job.state = "processing";
      render();
      try {
        const result = await pool.process(job.file, state.settings);
        job.output = result.blob;
        job.outputName = `${basename(job.file.name)}.pixel.${result.extension}`;
        job.state = "done";
        job.error = undefined;
      } catch (error) {
        job.state = "failed";
        job.error = error instanceof Error ? error.message : "Compression failed.";
      }
      render();
    }),
  );

  state.running = false;
  render();
}

async function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({ url, filename, saveAs: false });
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

async function downloadJob(id: string) {
  const job = state.jobs.find((candidate) => candidate.id === id);
  if (job?.output && job.outputName) await download(job.output, job.outputName);
}

async function downloadZip() {
  const files = state.jobs.filter((job) => job.output && job.outputName);
  if (!files.length) return;

  const archive: Record<string, Uint8Array> = {};
  for (const job of files) archive[job.outputName!] = new Uint8Array(await job.output!.arrayBuffer());
  await download(new Blob([zipSync(archive)], { type: "application/zip" }), "pixel-squoosh.zip");
}

function clear() {
  if (state.running) return;
  state.jobs = [];
  render();
}

function render() {
  const done = state.jobs.filter((job) => job.state === "done").length;
  const canRun = state.jobs.some((job) => job.state === "queued" || job.state === "failed") && !state.running;
  const canZip = done > 0 && !state.running;

  app.innerHTML = `
    <header class="masthead">
      <a class="brand" href="#" aria-label="Pixel Squoosh home">
        <span class="brand-mark">PS</span>
        <span>PIXEL<br /><b>SQUOOSH</b></span>
      </a>
      <p>LOCAL IMAGE SHRINKER <span>///</span> NO UPLOADS</p>
      <div class="status"><i></i>${state.running ? "CRUNCHING..." : "READY"}</div>
    </header>
    <section class="control-grid">
      <div class="panel settings">
        <div class="panel-title"><span>01</span> COMPRESSION CONFIG</div>
        <label class="label">OUTPUT FORMAT</label>
        <div class="format-grid">
          ${Object.entries(formatLabels)
            .map(
              ([format, label]) =>
                `<button class="format ${state.settings.format === format ? "is-active" : ""}" data-format="${format}">${label}</button>`,
            )
            .join("")}
        </div>
        <label class="label range-label">QUALITY <output>${state.settings.quality}</output></label>
        <input id="quality" type="range" min="1" max="100" value="${state.settings.quality}" />
        <label class="label range-label">LONGEST EDGE <output>${state.settings.maxDimension}px</output></label>
        <input id="dimension" type="range" min="640" max="3840" step="160" value="${state.settings.maxDimension}" />
        <div class="tip">PNG ignores quality. AVIF takes longer but makes the smallest files.</div>
      </div>
      <div class="panel drop-panel">
        <div class="panel-title"><span>02</span> LOAD PIXELS</div>
        <label class="dropzone" id="dropzone">
          <input id="file-input" type="file" accept="image/*" multiple hidden />
          <span class="drop-icon">⇩</span>
          <b>DROP IMAGES HERE</b>
          <small>CLICK · DROP · PASTE · JPG PNG WEBP AVIF</small>
        </label>
      </div>
    </section>
    <section class="panel queue-panel">
      <div class="queue-head">
        <div class="panel-title"><span>03</span> BATCH QUEUE <em>${state.jobs.length} FILES</em></div>
        <div class="action-bar">
          <button class="button ghost" id="clear" ${state.running || !state.jobs.length ? "disabled" : ""}>CLEAR</button>
          <button class="button yellow" id="run" ${canRun ? "" : "disabled"}>${state.running ? "WORKING" : "START"}</button>
          <button class="button cyan" id="zip" ${canZip ? "" : "disabled"}>DOWNLOAD ZIP</button>
        </div>
      </div>
      <div class="queue">
        ${
          state.jobs.length
            ? state.jobs
                .map((job, index) => {
                  const reduction = job.output ? Math.round((1 - job.output.size / job.sourceSize) * 100) : 0;
                  return `<article class="job job-${job.state}">
                    <span class="job-index">${String(index + 1).padStart(2, "0")}</span>
                    <span class="file-name" title="${job.file.name}">${job.file.name}</span>
                    <span class="file-size">${bytes(job.sourceSize)}</span>
                    <span class="arrow">→</span>
                    <span class="file-size">${job.output ? bytes(job.output.size) : "—"}</span>
                    <span class="job-state">${job.state === "done" ? `${reduction}% SMALLER` : job.state === "failed" ? "ERROR" : job.state.toUpperCase()}</span>
                    ${job.output ? `<button class="mini-download" data-download="${job.id}">↓ SAVE</button>` : ""}
                    ${job.error ? `<small class="error">${job.error}</small>` : ""}
                  </article>`;
                })
                .join("")
            : `<div class="empty"><b>QUEUE EMPTY</b><span>Feed it pixels. We will do the rest.</span></div>`
        }
      </div>
      <footer><span>DONE ${done}/${state.jobs.length}</span><span>2 WORKERS MAX</span><span>RUNS ON YOUR DEVICE</span></footer>
    </section>
  `;

  app.querySelectorAll<HTMLButtonElement>("[data-format]").forEach((button) =>
    button.addEventListener("click", () => {
      state.settings.format = button.dataset.format as OutputFormat;
      render();
    }),
  );
  app.querySelector<HTMLInputElement>("#quality")?.addEventListener("input", (event) => {
    state.settings.quality = Number((event.target as HTMLInputElement).value);
    render();
  });
  app.querySelector<HTMLInputElement>("#dimension")?.addEventListener("input", (event) => {
    state.settings.maxDimension = Number((event.target as HTMLInputElement).value);
    render();
  });
  app.querySelector<HTMLInputElement>("#file-input")?.addEventListener("change", (event) => addFiles((event.target as HTMLInputElement).files!));
  app.querySelector("#run")?.addEventListener("click", run);
  app.querySelector("#zip")?.addEventListener("click", downloadZip);
  app.querySelector("#clear")?.addEventListener("click", clear);
  app.querySelectorAll<HTMLButtonElement>("[data-download]").forEach((button) =>
    button.addEventListener("click", () => downloadJob(button.dataset.download!)),
  );

  const dropzone = app.querySelector<HTMLElement>("#dropzone")!;
  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("dragging");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragging"));
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragging");
    if (event.dataTransfer?.files) addFiles(event.dataTransfer.files);
  });
}

window.addEventListener("beforeunload", () => pool.destroy());
window.addEventListener("paste", addClipboardImages);
render();
