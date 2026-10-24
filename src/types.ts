export type OutputFormat = "avif" | "webp" | "jpeg" | "png";
export type JobState = "queued" | "processing" | "done" | "failed";

export type EffortFormat = Exclude<OutputFormat, "jpeg">;

export type Settings = {
  format: OutputFormat;
  quality: number;
  /** 0 means keep the original size. */
  maxDimension: number;
  /** Higher is slower and smaller: WebP method, inverted AVIF speed, oxipng level. */
  effort: Record<EffortFormat, number>;
  /** 4:4:4 for JPEG/AVIF, sharp YUV for WebP. */
  fullChroma: boolean;
};

export type Dimensions = { width: number; height: number };

export type CompressResult = Dimensions & { blob: Blob; extension: string };

export type ImageJob = {
  id: string;
  file: File;
  state: JobState;
  sourceSize: number;
  sourceUrl: string;
  sourceDims?: Dimensions;
  output?: Blob;
  outputUrl?: string;
  outputDims?: Dimensions;
  outputName?: string;
  outputSettings?: Settings;
  error?: string;
};

export type WorkerRequest = {
  id: string;
  file: ArrayBuffer;
  mime: string;
  name: string;
  settings: Settings;
};

export type WorkerResponse =
  | {
      id: string;
      ok: true;
      output: ArrayBuffer;
      mime: string;
      extension: string;
      width: number;
      height: number;
    }
  | { id: string; ok: false; error: string };
