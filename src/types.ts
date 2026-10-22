export type OutputFormat = "avif" | "webp" | "jpeg" | "png";
export type JobState = "queued" | "processing" | "done" | "failed";

export type Settings = {
  format: OutputFormat;
  quality: number;
  maxDimension: number;
};

export type ImageJob = {
  id: string;
  file: File;
  state: JobState;
  sourceSize: number;
  output?: Blob;
  outputName?: string;
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
    }
  | { id: string; ok: false; error: string };
