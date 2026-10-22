/// <reference lib="webworker" />

import avifEncoderFactory from "@jsquash/avif/codec/enc/avif_enc.js";
import { initEmscriptenModule } from "@jsquash/avif/utils.js";
import { encode as encodeJpeg } from "@jsquash/jpeg";
import { encode as encodePng } from "@jsquash/png";
import { encode as encodeWebp } from "@jsquash/webp";
import type { OutputFormat, WorkerRequest, WorkerResponse } from "./types";

const outputInfo: Record<OutputFormat, { mime: string; extension: string }> = {
  avif: { mime: "image/avif", extension: "avif" },
  webp: { mime: "image/webp", extension: "webp" },
  jpeg: { mime: "image/jpeg", extension: "jpg" },
  png: { mime: "image/png", extension: "png" },
};

let avifEncoder: Promise<any> | undefined;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function getImageData(file: ArrayBuffer, mime: string, maxDimension: number) {
  const blob = new Blob([file], { type: mime || "application/octet-stream" });
  const source = await createImageBitmap(blob);
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) throw new Error("Could not create an image canvas.");

  context.drawImage(source, 0, 0, width, height);
  source.close();
  return context.getImageData(0, 0, width, height);
}

async function encode(format: OutputFormat, data: ImageData, quality: number) {
  const q = clamp(quality, 1, 100);

  switch (format) {
    case "avif": {
      // Never invoke @jsquash/avif's automatic thread detector. Chromium
      // extensions can expose WASM threads without supporting the nested
      // worker that the multi-threaded AVIF encoder needs.
      avifEncoder ??= initEmscriptenModule(avifEncoderFactory);
      const encoder = await avifEncoder;
      const output = encoder.encode(new Uint8Array(data.data.buffer), data.width, data.height, {
        quality: q,
        qualityAlpha: -1,
        speed: 6,
        bitDepth: 8,
      });
      if (!output) throw new Error("AVIF encoder could not produce an image.");
      return output.buffer;
    }
    case "webp":
      return encodeWebp(data, { quality: q });
    case "jpeg":
      return encodeJpeg(data, { quality: q });
    case "png":
      return encodePng(data, { effort: 3 } as never);
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    const image = await getImageData(request.file, request.mime, request.settings.maxDimension);
    const output = await encode(request.settings.format, image, request.settings.quality);
    const info = outputInfo[request.settings.format];
    const response: WorkerResponse = {
      id: request.id,
      ok: true,
      output,
      mime: info.mime,
      extension: info.extension,
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
