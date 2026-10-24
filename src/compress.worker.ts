/// <reference lib="webworker" />

import avifEncoderFactory from "@jsquash/avif/codec/enc/avif_enc.js";
import { defaultOptions as avifDefaults } from "@jsquash/avif/meta.js";
import { initEmscriptenModule } from "@jsquash/avif/utils.js";
import { encode as encodeJpeg } from "@jsquash/jpeg";
import initOxipng, { optimise_raw } from "@jsquash/oxipng/codec/pkg/squoosh_oxipng.js";
import { encode as encodeWebp } from "@jsquash/webp";
import type { OutputFormat, Settings, WorkerRequest, WorkerResponse } from "./types";

const outputInfo: Record<OutputFormat, { mime: string; extension: string }> = {
  avif: { mime: "image/avif", extension: "avif" },
  webp: { mime: "image/webp", extension: "webp" },
  jpeg: { mime: "image/jpeg", extension: "jpg" },
  png: { mime: "image/png", extension: "png" },
};

let avifEncoder: Promise<any> | undefined;
let oxipngReady: Promise<unknown> | undefined;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function getImageData(file: ArrayBuffer, mime: string, maxDimension: number) {
  const blob = new Blob([file], { type: mime || "application/octet-stream" });
  const source = await createImageBitmap(blob);
  const scale = maxDimension ? Math.min(1, maxDimension / Math.max(source.width, source.height)) : 1;
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) throw new Error("Could not create an image canvas.");

  context.drawImage(source, 0, 0, width, height);
  source.close();
  return context.getImageData(0, 0, width, height);
}

async function encode(data: ImageData, { format, quality, effort, fullChroma }: Settings) {
  const q = clamp(quality, 1, 100);

  switch (format) {
    case "avif": {
      // Never invoke @jsquash/avif's automatic thread detector. Chromium
      // extensions can expose WASM threads without supporting the nested
      // worker that the multi-threaded AVIF encoder needs.
      avifEncoder ??= initEmscriptenModule(avifEncoderFactory);
      const encoder = await avifEncoder;
      // The raw embind encoder rejects partial option objects.
      const output = encoder.encode(new Uint8Array(data.data.buffer), data.width, data.height, {
        ...avifDefaults,
        quality: q,
        speed: clamp(10 - effort.avif, 0, 10),
        subsample: fullChroma ? 3 : 1,
      });
      if (!output) throw new Error("AVIF encoder could not produce an image.");
      return output.buffer;
    }
    case "webp":
      return encodeWebp(data, { quality: q, method: clamp(effort.webp, 0, 6), use_sharp_yuv: fullChroma ? 1 : 0 });
    case "jpeg":
      return encodeJpeg(data, { quality: q, auto_subsample: !fullChroma, chroma_subsample: fullChroma ? 1 : 2 });
    case "png": {
      // Same reason as AVIF: load the single-threaded build directly.
      oxipngReady ??= initOxipng();
      await oxipngReady;
      return optimise_raw(data.data, data.width, data.height, clamp(effort.png, 0, 6), false, false).buffer;
    }
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    const image = await getImageData(request.file, request.mime, request.settings.maxDimension);
    const output = await encode(image, request.settings);
    const info = outputInfo[request.settings.format];
    const response: WorkerResponse = {
      id: request.id,
      ok: true,
      output,
      mime: info.mime,
      extension: info.extension,
      width: image.width,
      height: image.height,
    };

    self.postMessage(response, [output]);
  } catch (cause) {
    const response: WorkerResponse = {
      id: request.id,
      ok: false,
      error: cause instanceof Error ? cause.message : "Image processing failed.",
    };
    self.postMessage(response);
  }
};
