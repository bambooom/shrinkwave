import { zipSync } from "fflate";
import "./style.css";
import { ditherGradient } from "./dither";
import { detectLocale, locales, messages, saveLocale, type Locale, type Messages } from "./i18n";
import { icons } from "./icons";
import { CompressionPool } from "./pool";
import type { Dimensions, EffortFormat, ImageJob, OutputFormat, Settings } from "./types";

type Tool = "compress" | "stitch";
type StitchDirection = "vertical" | "horizontal";
type StitchItem = { id: string; file: File; url: string };
type PreviewMode = "before" | "after";
type StitchError = { kind: "tooLarge" } | { kind: "failed"; message: string };

const APP_NAME = "Shrinkwave";
const APP_SLUG = "shrinkwave";
const MAX_STITCH_EDGE = 2048;
const MAX_CANVAS_EDGE = 16384;
const formats: OutputFormat[] = ["webp", "avif", "jpeg", "png"];
const formatLabels: Record<OutputFormat, string> = { avif: "AVIF", webp: "WEBP", jpeg: "JPEG", png: "PNG" };
const effortMax: Record<EffortFormat, number> = { webp: 6, avif: 10, png: 6 };
const EDGE_MIN = 320;
const EDGE_STEP = 80;
// One step past 3840 stands for "no resize" (maxDimension 0).
const EDGE_ORIGINAL = 3920;
const SETTINGS_KEY = "shrinkwave.settings";
const defaultSettings: Settings = {
  format: "webp",
  quality: 80,
  maxDimension: 1200,
  effort: { webp: 4, avif: 4, png: 2 },
  fullChroma: false,
};

function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<Settings>;
    const settings = { ...defaultSettings, ...saved, effort: { ...defaultSettings.effort, ...saved.effort } };
    return formats.includes(settings.format) ? settings : structuredClone(defaultSettings);
  } catch {
    return structuredClone(defaultSettings);
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function hasEffort(format: OutputFormat): format is EffortFormat {
  return format !== "jpeg";
}

const app = document.querySelector<HTMLElement>("#app")!;
// `?view=panel` lets the dev server preview the side panel chrome.
let inPanel = new URLSearchParams(location.search).get("view") === "panel";
// Side panels / sidebars aren't tabs, so getCurrent() yields no tab there.
globalThis.chrome?.tabs?.getCurrent?.((tab) => {
  if (inPanel === !tab) return;
  inPanel = !tab;
  render();
});

const sunset = ["#7b2ff7", "#b02bd0", "#ff2a9d", "#ff5f73", "#ff9f45", "#ffd23f"];
const rootStyle = document.documentElement.style;
rootStyle.setProperty("--dither-sunset", ditherGradient(sunset));
rootStyle.setProperty("--dither-cyan", ditherGradient(["#0a7f8f", "#149fbf", "#2de2e6", "#a8fcff"]));
rootStyle.setProperty("--dither-banner", ditherGradient([...sunset].reverse(), { vertical: true }));
const pool = new CompressionPool(2);
const state = {
  locale: detectLocale(),
  tool: "compress" as Tool,
  startOpen: false,
  jobs: [] as ImageJob[],
  selectedJob: undefined as string | undefined,
  previewMode: "after" as PreviewMode,
  running: false,
  settings: loadSettings(),
  advancedOpen: false,
  stitchItems: [] as StitchItem[],
  stitchDirection: "vertical" as StitchDirection,
  stitchOutput: undefined as Blob | undefined,
  stitchPreview: undefined as string | undefined,
  stitchDims: undefined as Dimensions | undefined,
  stitchFit: false,
  stitchError: undefined as StitchError | undefined,
  stitching: false,
};

function t(): Messages {
  return messages[state.locale];
}

function esc(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function bytes(value?: number) {
  if (!value) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(2)} MB`;
}

function basename(name: string) {
  return name.replace(/\.[^/.]+$/, "");
}

function sizeChange(before: number, after: number) {
  const raw = (after / before - 1) * 100;
  // Keep a decimal near -100% so a tiny file never reads as "-100%".
  const change = Math.abs(raw) >= 99 ? Math.round(raw * 10) / 10 : Math.round(raw);
  return `${change > 0 ? "+" : ""}${change}%`;
}

function clock() {
  return new Date().toLocaleTimeString(state.locale, { hour: "2-digit", minute: "2-digit" });
}

function setStitchOutput(blob?: Blob, size?: Dimensions) {
  if (state.stitchPreview) URL.revokeObjectURL(state.stitchPreview);
  state.stitchOutput = blob;
  state.stitchPreview = blob ? URL.createObjectURL(blob) : undefined;
  state.stitchDims = blob ? size : undefined;
}

function addFiles(files: FileList | File[]) {
  const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
  if (!images.length) return;

  if (state.tool === "stitch") {
    if (state.stitching) return;
    state.stitchItems.push(...images.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) })));
    state.stitchError = undefined;
    setStitchOutput();
  } else {
    if (state.running) return;
    const added = images.map(
      (file): ImageJob => ({
        id: crypto.randomUUID(),
        file,
        sourceSize: file.size,
        sourceUrl: URL.createObjectURL(file),
        state: "queued",
      }),
    );
    state.jobs.push(...added);
    state.selectedJob = added[0].id;
    void Promise.all(
      added.map(async (job) => {
        try {
          job.sourceDims = await readDims(job.sourceUrl);
        } catch {
          // Undecodable here; the worker will report a proper error on compress.
        }
      }),
    ).then(render);
  }
  render();
}

async function readDims(url: string): Promise<Dimensions> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return { width: image.naturalWidth, height: image.naturalHeight };
}

function fitDims({ width, height }: Dimensions, maxEdge: number): Dimensions {
  const scale = maxEdge ? Math.min(1, maxEdge / Math.max(width, height)) : 1;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function dims(value?: Dimensions) {
  return value ? `${value.width}×${value.height}` : "…";
}

function releaseJob(job: ImageJob) {
  URL.revokeObjectURL(job.sourceUrl);
  if (job.outputUrl) URL.revokeObjectURL(job.outputUrl);
}

function removeJobs(predicate: (job: ImageJob) => boolean) {
  if (state.running) return;
  state.jobs = state.jobs.filter((job) => {
    if (!predicate(job)) return true;
    releaseJob(job);
    return false;
  });
  if (!state.jobs.some((job) => job.id === state.selectedJob)) state.selectedJob = state.jobs[0]?.id;
  render();
}

function removeStitchItems(predicate: (item: StitchItem) => boolean) {
  if (state.stitching) return;
  state.stitchItems = state.stitchItems.filter((item) => {
    if (!predicate(item)) return true;
    URL.revokeObjectURL(item.url);
    return false;
  });
  state.stitchError = undefined;
  setStitchOutput();
  render();
}

function addClipboardImages(event: ClipboardEvent) {
  const images = Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item, index) => {
      const file = item.getAsFile();
      const extension = file?.type.split("/")[1] || "png";
      return file && new File([file], file.name || `pasted-${Date.now()}-${index + 1}.${extension}`, { type: file.type });
    })
    .filter((file): file is File => Boolean(file));
  if (!images.length) return;
  event.preventDefault();
  addFiles(images);
}

// Only the fields that affect the current format's output, so irrelevant tweaks don't mark results stale.
function settingsKey({ format, quality, maxDimension, effort, fullChroma }: Settings) {
  const lossy = format !== "png";
  return [format, maxDimension, lossy && quality, hasEffort(format) && effort[format], lossy && fullChroma].join("|");
}

function edgeLabel(maxDimension: number) {
  return maxDimension ? `${maxDimension}px` : t().noResize;
}

function settingsLabel({ format, quality, maxDimension, effort, fullChroma }: Settings) {
  const lossy = format !== "png";
  return [
    formatLabels[format],
    lossy && `Q${quality}`,
    edgeLabel(maxDimension),
    hasEffort(format) && effort[format] !== defaultSettings.effort[format] && `E${effort[format]}`,
    lossy && fullChroma && (format === "webp" ? "SharpYUV" : "4:4:4"),
  ]
    .filter(Boolean)
    .join(" · ");
}

function isStale(job: ImageJob) {
  return job.state === "done" && !!job.outputSettings && settingsKey(job.outputSettings) !== settingsKey(state.settings);
}

function needsRun(job: ImageJob) {
  return job.state === "queued" || job.state === "failed" || isStale(job);
}

async function runCompression() {
  const pending = state.jobs.filter(needsRun);
  if (state.running || !pending.length) return;
  const settings = structuredClone(state.settings);
  state.running = true;
  render();

  await Promise.all(
    pending.map(async (job) => {
      job.state = "processing";
      render();
      try {
        const result = await pool.process(job.file, settings);
        if (job.outputUrl) URL.revokeObjectURL(job.outputUrl);
        job.output = result.blob;
        job.outputUrl = URL.createObjectURL(result.blob);
        job.outputDims = { width: result.width, height: result.height };
        job.outputName = `${basename(job.file.name)}.min.${result.extension}`;
        job.outputSettings = settings;
        job.state = "done";
        job.error = undefined;
      } catch (error) {
        job.state = "failed";
        job.error = error instanceof Error ? error.message : String(error);
      }
      render();
    }),
  );

  state.running = false;
  render();
}

async function stitch() {
  if (state.stitching || state.stitchItems.length < 2) return;
  state.stitching = true;
  state.stitchError = undefined;
  setStitchOutput();
  render();

  const bitmaps: ImageBitmap[] = [];
  try {
    for (const { file } of state.stitchItems) bitmaps.push(await createImageBitmap(file));
    const vertical = state.stitchDirection === "vertical";
    const shared = Math.min(MAX_STITCH_EDGE, Math.max(...bitmaps.map((bitmap) => (vertical ? bitmap.width : bitmap.height))));
    const sizes = bitmaps.map((bitmap) =>
      vertical
        ? { width: shared, height: Math.max(1, Math.round((bitmap.height * shared) / bitmap.width)) }
        : { width: Math.max(1, Math.round((bitmap.width * shared) / bitmap.height)), height: shared },
    );
    const length = sizes.reduce((sum, size) => sum + (vertical ? size.height : size.width), 0);

    if (length > MAX_CANVAS_EDGE) {
      state.stitchError = { kind: "tooLarge" };
    } else {
      const width = vertical ? shared : length;
      const height = vertical ? length : shared;
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2D canvas is unavailable.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.imageSmoothingQuality = "high";

      let offset = 0;
      bitmaps.forEach((bitmap, index) => {
        const size = sizes[index];
        context.drawImage(bitmap, vertical ? 0 : offset, vertical ? offset : 0, size.width, size.height);
        offset += vertical ? size.height : size.width;
      });
      setStitchOutput(await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 }), { width, height });
    }
  } catch (error) {
    state.stitchError = { kind: "failed", message: error instanceof Error ? error.message : String(error) };
  } finally {
    bitmaps.forEach((bitmap) => bitmap.close());
    state.stitching = false;
    render();
  }
}

async function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    if (globalThis.chrome?.downloads) {
      await chrome.downloads.download({ url, filename, saveAs: false });
    } else {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
    }
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

const canCopyImages = typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;

async function toPng(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    return await canvas.convertToBlob({ type: "image/png" });
  } finally {
    bitmap.close();
  }
}

async function copyImage(blob: Blob, key: string) {
  // Async clipboard only accepts image/png. Pass a promise so the click's user activation survives the conversion.
  const png = blob.type === "image/png" ? Promise.resolve(blob) : toPng(blob);
  let ok = true;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
  } catch (error) {
    ok = false;
    console.error(error);
  }
  flashCopyButton(key, ok);
}

function flashCopyButton(key: string, ok: boolean) {
  const m = t();
  // The same result can have a copy button both in its row and in the preview head.
  app.querySelectorAll<HTMLButtonElement>(`[data-copy="${key}"]`).forEach((button) => {
    button.textContent = ok ? m.copied : m.copyFailed;
    button.classList.add(ok ? "flash-ok" : "flash-fail");
    window.setTimeout(() => {
      button.textContent = m.copy;
      button.classList.remove("flash-ok", "flash-fail");
    }, 1500);
  });
}

function copyButton(key: string, m: Messages, extra = "") {
  return canCopyImages ? `<button class="${extra}" data-copy="${key}" title="${m.copyHint}">${m.copy}</button>` : "";
}

async function downloadZip() {
  const files = state.jobs.filter((job) => job.output && job.outputName);
  if (!files.length) return;

  const archive: Record<string, Uint8Array> = {};
  for (const job of files) {
    let name = job.outputName!;
    for (let i = 2; name in archive; i++) name = job.outputName!.replace(/(\.[^.]+)$/, `-${i}$1`);
    archive[name] = new Uint8Array(await job.output!.arrayBuffer());
  }
  await download(new Blob([zipSync(archive)], { type: "application/zip" }), `${APP_SLUG}.zip`);
}

function moveStitchItem(id: string, delta: number) {
  const from = state.stitchItems.findIndex((item) => item.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= state.stitchItems.length) return;
  const [item] = state.stitchItems.splice(from, 1);
  state.stitchItems.splice(to, 0, item);
  setStitchOutput();
  render();
}

function setLocale(locale: Locale) {
  state.locale = locale;
  state.startOpen = false;
  saveLocale(locale);
  render();
}

function toolIcon(tool: Tool, size: number) {
  return tool === "compress" ? icons.floppy(size) : icons.stitch(size);
}

function toolLabel(tool: Tool, m: Messages) {
  return tool === "compress" ? m.compress : m.stitch;
}

const fileInput = `<input id="file-input" type="file" accept="image/*" multiple hidden />`;

function dropzone(title: string, m: Messages) {
  return `<label class="dropzone" id="dropzone" for="file-input" tabindex="0">
    ${icons.folder(48)}
    <b>${title}</b>
    <small>${m.dropHint}</small>
  </label>`;
}

function listHead(label: string, count: number, m: Messages, locked: boolean, hint = "") {
  return `<div class="list-head">
    <span class="label-chip">${label}</span><span class="muted">${m.count(count)}</span>
    ${hint ? `<span class="list-hint">${hint}</span>` : ""}
    <span class="spacer"></span>
    <button id="add-files" class="small" ${locked ? "disabled" : ""}>${m.addImages}</button>
  </div>`;
}

function previewPanel(head: string, body: string, meta: string, variant = "") {
  return `<section class="preview-panel ${variant}">
    <div class="preview-head">${head}</div>
    <div class="preview-box">${body}</div>
    <div class="preview-meta">${meta}</div>
  </section>`;
}

function compressPreview(m: Messages) {
  const job = state.jobs.find((candidate) => candidate.id === state.selectedJob) ?? state.jobs[0];
  const showAfter = state.previewMode === "after" && !!job.outputUrl;
  const modeButton = (mode: PreviewMode, label: string, disabled: boolean) =>
    `<button class="small ${(mode === "after") === showAfter ? "pressed" : ""}" data-preview-mode="${mode}" ${
      disabled ? "disabled" : ""
    }>${label}</button>`;
  const meta = job.output
    ? `<span>${bytes(job.sourceSize)} → ${bytes(job.output.size)} (${sizeChange(job.sourceSize, job.output.size)})</span>
      <span>${dims(job.sourceDims)} → ${dims(job.outputDims)}</span>${
        job.outputSettings ? `<span>${settingsLabel(job.outputSettings)}</span>` : ""
      }`
    : `<span>${bytes(job.sourceSize)}</span>
      <span>${dims(job.sourceDims)} → ${m.estimated} <b id="estimate-dims">${
        job.sourceDims ? dims(fitDims(job.sourceDims, state.settings.maxDimension)) : "…"
      }</b></span><span>${m.notCompressed}</span>`;

  return previewPanel(
    `<span class="label-chip">${m.preview}</span>
      <span class="preview-name" title="${esc(job.file.name)}">${esc(job.file.name)}</span>
      <span class="segmented">${modeButton("before", m.colBefore, false)}${modeButton("after", m.colAfter, !job.outputUrl)}</span>${
        job.output
          ? `<span class="preview-actions">${copyButton(job.id, m, "small")}<button class="small" data-download="${job.id}">${m.save}</button></span>`
          : ""
      }`,
    `<img src="${showAfter ? job.outputUrl : job.sourceUrl}" alt="${esc(job.file.name)}" />`,
    meta,
  );
}

function stitchPreview(m: Messages) {
  const count = state.stitchItems.length;
  const ready = !!state.stitchPreview;
  const fitButton = (fit: boolean, label: string) =>
    `<button class="small ${ready && state.stitchFit === fit ? "pressed" : ""}" data-stitch-fit="${fit}" ${
      ready ? "" : "disabled"
    }>${label}</button>`;
  const fill = ready && !state.stitchFit;
  return previewPanel(
    `<span class="label-chip">${m.preview}</span>
      ${fill ? `<span class="list-hint">${m.scrollHint}</span>` : ""}
      <span class="segmented">${fitButton(false, m.fillView)}${fitButton(true, m.fitView)}</span>`,
    ready
      ? `<img src="${state.stitchPreview}" alt="${m.preview}" />`
      : `<span class="muted">${count < 2 ? m.needTwo : m.stitchPending}</span>`,
    state.stitchOutput
      ? `<span>${m.stitchReady(bytes(state.stitchOutput.size))}</span><span>${dims(state.stitchDims)}</span>`
      : m.count(count),
    `stitch-panel ${fill ? `fill-${state.stitchDirection}` : "fit"}`,
  );
}

function fileCell(name: string, url: string) {
  return `<td class="file" title="${esc(name)}"><span class="file-cell"><img class="thumb" src="${url}" alt="" loading="lazy" decoding="async" /><span>${esc(
    name,
  )}</span></span></td>`;
}

function advancedPanel(m: Messages) {
  const { format, effort, fullChroma } = state.settings;
  const locked = state.running ? "disabled" : "";
  const effortRow = hasEffort(format)
    ? `<label class="field-row">
        <span class="field-label">${m.effort}</span>
        <input id="effort" type="range" min="0" max="${effortMax[format]}" value="${effort[format]}" ${locked} />
        <output id="effort-value" class="value-box">${effort[format]}</output>
      </label>
      <p class="note">${m.effortNote[format]}</p>`
    : "";
  const chromaRow =
    format === "png"
      ? ""
      : `<label class="check-row"><input id="full-chroma" type="checkbox" ${fullChroma ? "checked" : ""} ${locked} /><span>${
          m.fullChroma
        }</span></label>
      <p class="note">${m.fullChromaNote[format]}</p>`;
  return `<details id="advanced" class="advanced" ${state.advancedOpen ? "open" : ""}>
      <summary>${m.advanced}</summary>
      <div class="advanced-body">${effortRow}${chromaRow}</div>
    </details>`;
}

function compressView(m: Messages) {
  const done = state.jobs.filter((job) => job.state === "done").length;
  const pending = state.jobs.filter(needsRun).length;
  const stale = state.jobs.some(isStale);
  const rows = state.jobs
    .map((job, index) => {
      const jobStale = isStale(job);
      const status = jobStale
        ? m.stale
        : job.state === "done" && job.output
          ? `${m.done} ${sizeChange(job.sourceSize, job.output.size)}`
          : m[job.state];
      const used = job.outputSettings ? ` title="${settingsLabel(job.outputSettings)}"` : "";
      return `<tr data-select="${job.id}" class="${job.id === state.selectedJob ? "selected" : ""}">
        <td class="num">${String(index + 1).padStart(2, "0")}</td>
        ${fileCell(job.file.name, job.sourceUrl)}
        <td class="num">${bytes(job.sourceSize)}<small class="dims">${dims(job.sourceDims)}</small></td>
        <td class="num ${jobStale || job.state === "processing" ? "outdated" : ""}"${used}>${
          job.output ? `${bytes(job.output.size)}<small class="dims">${dims(job.outputDims)}</small>` : "—"
        }</td>
        <td><span class="chip chip-${jobStale ? "stale" : job.state}"${used}>${status}</span></td>
        <td class="actions">${
          job.output
            ? `${copyButton(job.id, m, "small")}<button class="small" data-download="${job.id}">${m.save}</button>`
            : ""
        }<button class="small icon-button" data-remove-job="${job.id}" title="${m.remove}" aria-label="${m.remove}" ${
          state.running ? "disabled" : ""
        }>✕</button></td>
      </tr>${job.error ? `<tr class="error-row"><td></td><td colspan="5">${esc(job.error)}</td></tr>` : ""}`;
    })
    .join("");

  return `${fileInput}<div class="tool-grid">
      <fieldset class="group">
        <legend>${m.output}</legend>
        <div class="field-row">
          <span class="field-label">${m.format}</span>
          <div class="radio-row">${formats
            .map(
              (format) => `<label class="radio"><input type="radio" name="format" value="${format}" ${
                state.settings.format === format ? "checked" : ""
              } ${state.running ? "disabled" : ""} /><span>${formatLabels[format]}<small class="format-tag">(${
                m.formatTags[format]
              })</small></span></label>`,
            )
            .join("")}</div>
        </div>
        <label class="field-row">
          <span class="field-label">${m.quality}</span>
          <input id="quality" type="range" min="1" max="100" value="${state.settings.quality}" ${
            state.settings.format === "png" || state.running ? "disabled" : ""
          } />
          <output id="quality-value" class="value-box">${state.settings.quality}</output>
        </label>
        <label class="field-row">
          <span class="field-label">${m.longestEdge}</span>
          <input id="dimension" type="range" min="${EDGE_MIN}" max="${EDGE_ORIGINAL}" step="${EDGE_STEP}" value="${
            state.settings.maxDimension || EDGE_ORIGINAL
          }" ${state.running ? "disabled" : ""} />
          <output id="dimension-value" class="value-box">${edgeLabel(state.settings.maxDimension)}</output>
        </label>
        <p class="note">${m.formatNote}</p>
        ${advancedPanel(m)}
      </fieldset>
      ${state.jobs.length ? compressPreview(m) : dropzone(m.dropCompress, m)}
      ${
        state.jobs.length
          ? `<div class="queue-area">${listHead(m.queue, state.jobs.length, m, state.running, m.clickToPreview)}
      <div class="list-view">
        <table>
          <colgroup><col class="c-num" /><col /><col class="c-size" /><col class="c-size" /><col class="c-status" /><col class="c-action" /></colgroup>
          <thead><tr><th>#</th><th>${m.colFile}</th><th>${m.colBefore}</th><th>${m.colAfter}</th><th>${m.colStatus}</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div></div>`
          : ""
      }
    </div>
    <div class="button-row">
      <button id="clear" ${state.running || !state.jobs.length ? "disabled" : ""}>${m.clear}</button>
      <span class="spacer"></span>
      <button id="run" class="primary" ${state.running || !pending ? "disabled" : ""}>${
        state.running ? m.running : stale ? m.rerun(pending) : m.run
      }</button>
      <button id="zip" class="accent" ${state.running || !done ? "disabled" : ""}>${m.zip}</button>
    </div>`;
}

function stitchView(m: Messages) {
  const count = state.stitchItems.length;
  const rows = state.stitchItems
    .map(
      (item, index) => `<tr>
        <td class="num">${String(index + 1).padStart(2, "0")}</td>
        ${fileCell(item.file.name, item.url)}
        <td class="num">${bytes(item.file.size)}</td>
        <td class="actions"><button class="small icon-button" data-move="${item.id}" data-delta="-1" title="${m.moveUp}" aria-label="${m.moveUp}" ${
          index === 0 || state.stitching ? "disabled" : ""
        }>▲</button><button class="small icon-button" data-move="${item.id}" data-delta="1" title="${m.moveDown}" aria-label="${m.moveDown}" ${
          index === count - 1 || state.stitching ? "disabled" : ""
        }>▼</button><button class="small icon-button" data-remove="${item.id}" title="${m.remove}" aria-label="${m.remove}" ${
          state.stitching ? "disabled" : ""
        }>✕</button></td>
      </tr>`,
    )
    .join("");
  const error = state.stitchError
    ? state.stitchError.kind === "tooLarge"
      ? m.errTooLarge
      : m.errStitch(esc(state.stitchError.message))
    : "";

  return `${fileInput}<div class="tool-grid stitch-grid">
      <fieldset class="group">
        <legend>${m.direction}</legend>
        <div class="direction-row">
          ${(["vertical", "horizontal"] as StitchDirection[])
            .map(
              (direction) => `<label class="direction-option">
                <input type="radio" name="direction" value="${direction}" ${state.stitchDirection === direction ? "checked" : ""} ${
                  state.stitching ? "disabled" : ""
                } />
                <span class="direction-card">${icons[direction](32)}<span>${m[direction]}</span></span>
              </label>`,
            )
            .join("")}
        </div>
        <p class="note">${m.stitchNote}</p>
      </fieldset>
      ${
        count
          ? `<div class="queue-area">${listHead(m.order, count, m, state.stitching)}
      <div class="list-view">
        <table>
          <colgroup><col class="c-num" /><col /><col class="c-size" /><col class="c-move" /></colgroup>
          <thead><tr><th>#</th><th>${m.colFile}</th><th>${m.colBefore}</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div></div>
      ${stitchPreview(m)}`
          : dropzone(m.dropStitch, m)
      }
    </div>
    ${error ? `<p class="error-box">${error}</p>` : ""}
    <div class="button-row">
      <button id="clear-stitch" ${state.stitching || !count ? "disabled" : ""}>${m.clear}</button>
      <span class="spacer"></span>
      <button id="stitch" class="primary" ${state.stitching || count < 2 ? "disabled" : ""}>${
        state.stitching ? m.stitching : m.runStitch
      }</button>
      ${state.stitchOutput ? copyButton("stitch", m) : ""}
      <button id="download-stitch" class="accent" ${state.stitchOutput ? "" : "disabled"}>${m.downloadJpeg}</button>
    </div>`;
}

function progressDialog(m: Messages) {
  const total = state.jobs.length;
  const finished = state.jobs.filter((job) => job.state === "done" || job.state === "failed").length;
  const percent = total ? Math.round((finished / total) * 100) : 0;
  return `<section class="window progress-dialog" role="status" aria-live="polite">
    <header class="title-bar title-bar-alt">
      <span class="title-text">${m.running} (${percent}%)</span>
      <span class="title-buttons" aria-hidden="true"><i>×</i></span>
    </header>
    <div class="dialog-body">
      <div class="transfer">${icons.folder(32)}<span class="transfer-track"><span class="flying-file">${icons.file(12)}</span></span>${icons.folder(32)}</div>
      <div class="progress"><div class="progress-fill" style="width: ${percent}%"></div></div>
      <p>${m.progress(finished, total)}</p>
    </div>
  </section>`;
}

function startMenu(m: Messages) {
  return `<div class="window start-menu" role="menu">
    <div class="start-banner"><span>${APP_NAME}</span></div>
    <div class="start-items">
      ${(["compress", "stitch"] as Tool[])
        .map((tool) => `<button role="menuitem" data-tool="${tool}">${toolIcon(tool, 24)}<span>${toolLabel(tool, m)}</span></button>`)
        .join("")}
      <hr />
      ${locales
        .map(
          (locale) =>
            `<button role="menuitemradio" aria-checked="${locale.id === state.locale}" data-locale="${locale.id}"><span class="check">${
              locale.id === state.locale ? "●" : ""
            }</span><span>${locale.label}</span></button>`,
        )
        .join("")}
    </div>
  </div>`;
}

function statusText(m: Messages) {
  if (state.tool === "stitch") return m.count(state.stitchItems.length);
  const finished = state.jobs.filter((job) => job.state === "done" || job.state === "failed").length;
  return state.jobs.length ? m.progress(finished, state.jobs.length) : m.count(0);
}

function render() {
  const m = t();
  const busy = state.running || state.stitching;
  const label = toolLabel(state.tool, m);
  document.documentElement.lang = state.locale;
  document.title = `${APP_NAME} · ${label}`;

  app.innerHTML = `<div class="desktop">
    <nav class="desktop-icons" aria-label="${APP_NAME}">
      ${(["compress", "stitch"] as Tool[])
        .map(
          (tool) => `<button class="desktop-icon ${state.tool === tool ? "selected" : ""}" data-tool="${tool}" aria-pressed="${
            state.tool === tool
          }">${toolIcon(tool, 32)}<span>${toolLabel(tool, m)}</span></button>`,
        )
        .join("")}
    </nav>
    <section class="window main-window" aria-label="${APP_NAME}">
      <header class="title-bar">
        ${toolIcon(state.tool, 16)}
        <span class="title-text">${APP_NAME.toUpperCase().replace(/\s+/g, "")}.EXE — ${label}</span>
        <span class="title-buttons">${
          inPanel
            ? `<i aria-hidden="true">_</i><button id="pop-out" title="${m.openInTab}" aria-label="${m.openInTab}">□</button><i aria-hidden="true">×</i>`
            : `<i aria-hidden="true">_</i><i aria-hidden="true">□</i><i aria-hidden="true">×</i>`
        }</span>
      </header>
      <div class="window-body">
        <div class="tabs" role="tablist">
          ${(["compress", "stitch"] as Tool[])
            .map(
              (tool) => `<button class="tab ${state.tool === tool ? "active" : ""}" role="tab" aria-selected="${
                state.tool === tool
              }" data-tool="${tool}">${toolLabel(tool, m)}</button>`,
            )
            .join("")}
        </div>
        <div class="tab-panel" role="tabpanel">${state.tool === "compress" ? compressView(m) : stitchView(m)}</div>
      </div>
      <div class="drop-overlay" aria-hidden="true">${icons.folder(48)}<b>${
        state.tool === "compress" ? m.dropReleaseCompress : m.dropReleaseStitch
      }</b></div>
      <footer class="status-bar">
        <span class="status-field">${busy ? m.working : m.ready}</span>
        <span class="status-field">${statusText(m)}</span>
        <span class="status-field grow">${m.localOnly}</span>
      </footer>
    </section>
    ${state.running ? progressDialog(m) : ""}
    ${state.startOpen ? startMenu(m) : ""}
    <div class="taskbar">
      <button id="start" class="start-button ${state.startOpen ? "pressed" : ""}" aria-expanded="${state.startOpen}">${icons.brand(16)}<span>${m.start}</span></button>
      <span class="task-button">${toolIcon(state.tool, 16)}<span>${APP_NAME} — ${label}</span></span>
      <div class="tray">
        <label class="tray-language">
          <span class="sr-only">${m.language}</span>
          <select id="locale">${locales
            .map((locale) => `<option value="${locale.id}" ${locale.id === state.locale ? "selected" : ""}>${locale.label}</option>`)
            .join("")}</select>
        </label>
        <time id="clock">${clock()}</time>
      </div>
    </div>
  </div>`;

  bind();
}

function on<T extends HTMLElement>(selector: string, type: string, handler: (element: T, event: Event) => void) {
  app.querySelectorAll<T>(selector).forEach((element) => element.addEventListener(type, (event) => handler(element, event)));
}

function bind() {
  on("[data-tool]", "click", (element) => {
    state.tool = element.dataset.tool as Tool;
    state.startOpen = false;
    render();
  });
  on("[data-locale]", "click", (element) => setLocale(element.dataset.locale as Locale));
  on<HTMLSelectElement>("#locale", "change", (element) => setLocale(element.value as Locale));
  on("#pop-out", "click", () => {
    void globalThis.chrome?.runtime?.sendMessage("open-tab");
  });
  on("#start", "click", () => {
    state.startOpen = !state.startOpen;
    render();
  });

  on<HTMLInputElement>('input[name="format"]', "change", (element) => {
    state.settings.format = element.value as OutputFormat;
    saveSettings();
    render();
  });
  on<HTMLInputElement>("#quality", "input", (element) => {
    state.settings.quality = Number(element.value);
    app.querySelector("#quality-value")!.textContent = element.value;
  });
  on<HTMLInputElement>("#effort", "input", (element) => {
    const { format } = state.settings;
    if (hasEffort(format)) state.settings.effort[format] = Number(element.value);
    app.querySelector("#effort-value")!.textContent = element.value;
  });
  on<HTMLInputElement>("#full-chroma", "change", (element) => {
    state.settings.fullChroma = element.checked;
    saveSettings();
    render();
  });
  on<HTMLDetailsElement>("#advanced", "toggle", (element) => {
    state.advancedOpen = element.open;
  });
  on<HTMLInputElement>("#dimension", "input", (element) => {
    const value = Number(element.value);
    state.settings.maxDimension = value >= EDGE_ORIGINAL ? 0 : value;
    app.querySelector("#dimension-value")!.textContent = edgeLabel(state.settings.maxDimension);
    const source = state.jobs.find((job) => job.id === state.selectedJob)?.sourceDims;
    const estimate = app.querySelector("#estimate-dims");
    if (source && estimate) estimate.textContent = dims(fitDims(source, state.settings.maxDimension));
  });
  // Re-render only on release; rendering during "input" would replace the slider mid-drag.
  on("#quality, #dimension, #effort", "change", () => {
    saveSettings();
    render();
  });
  on<HTMLInputElement>('input[name="direction"]', "change", (element) => {
    state.stitchDirection = element.value as StitchDirection;
    setStitchOutput();
    render();
  });

  on<HTMLInputElement>("#file-input", "change", (element) => {
    if (element.files) addFiles(element.files);
    element.value = "";
  });
  on("#add-files", "click", () => app.querySelector<HTMLInputElement>("#file-input")?.click());
  on("[data-select]", "click", (element) => {
    if (state.selectedJob === element.dataset.select) return;
    state.selectedJob = element.dataset.select;
    render();
  });
  on("[data-preview-mode]", "click", (element) => {
    state.previewMode = element.dataset.previewMode as PreviewMode;
    render();
  });
  on("[data-stitch-fit]", "click", (element) => {
    state.stitchFit = element.dataset.stitchFit === "true";
    render();
  });
  on("[data-remove-job]", "click", (element, event) => {
    event.stopPropagation();
    removeJobs((job) => job.id === element.dataset.removeJob);
  });
  on("#dropzone", "keydown", (_element, event) => {
    const key = (event as KeyboardEvent).key;
    if (key !== "Enter" && key !== " ") return;
    event.preventDefault();
    app.querySelector<HTMLInputElement>("#file-input")?.click();
  });

  on("#run", "click", () => void runCompression());
  on("#zip", "click", () => void downloadZip());
  on("#clear", "click", () => removeJobs(() => true));
  on("[data-download]", "click", (element) => {
    const job = state.jobs.find((candidate) => candidate.id === element.dataset.download);
    if (job?.output && job.outputName) void download(job.output, job.outputName);
  });
  on("[data-copy]", "click", (element) => {
    const key = element.dataset.copy!;
    const blob = key === "stitch" ? state.stitchOutput : state.jobs.find((job) => job.id === key)?.output;
    if (blob) void copyImage(blob, key);
  });

  on("#stitch", "click", () => void stitch());
  on("#download-stitch", "click", () => {
    if (state.stitchOutput) void download(state.stitchOutput, `${APP_SLUG}-stitch.jpg`);
  });
  on("#clear-stitch", "click", () => removeStitchItems(() => true));
  on("[data-move]", "click", (element) => moveStitchItem(element.dataset.move!, Number(element.dataset.delta)));
  on("[data-remove]", "click", (element) => removeStitchItems((item) => item.id === element.dataset.remove));
}

function hasFiles(event: DragEvent) {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

function setDragging(dragging: boolean) {
  const locked = state.tool === "compress" ? state.running : state.stitching;
  app.querySelector(".desktop")?.classList.toggle("dragging", dragging && !locked);
}

let dragDepth = 0;
window.addEventListener("dragenter", (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragDepth++;
  setDragging(true);
});
window.addEventListener("dragover", (event) => {
  if (hasFiles(event)) event.preventDefault();
});
window.addEventListener("dragleave", (event) => {
  if (!hasFiles(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) setDragging(false);
});
window.addEventListener("drop", (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragDepth = 0;
  setDragging(false);
  addFiles(event.dataTransfer!.files);
});

document.addEventListener("click", (event) => {
  if (!state.startOpen || (event.target as Element).closest(".start-menu, #start")) return;
  state.startOpen = false;
  render();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !state.startOpen) return;
  state.startOpen = false;
  render();
});

window.addEventListener("paste", addClipboardImages);
window.addEventListener("beforeunload", () => pool.destroy());
window.setInterval(() => {
  const element = app.querySelector("#clock");
  if (element) element.textContent = clock();
}, 10_000);

render();
