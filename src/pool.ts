import type { CompressResult, Settings, WorkerRequest, WorkerResponse } from "./types";

type Pending = {
  resolve: (value: CompressResult) => void;
  reject: (reason: Error) => void;
};

export class CompressionPool {
  private readonly workers: Worker[];
  private readonly idle: Worker[];
  private readonly queue: Array<{ request: WorkerRequest; pending: Pending }> = [];
  private readonly pending = new Map<Worker, Pending>();

  constructor(size = 2) {
    this.workers = Array.from(
      { length: size },
      () => new Worker(new URL("./compress.worker.ts", import.meta.url), { type: "module" }),
    );
    this.idle = [...this.workers];

    for (const worker of this.workers) {
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.finish(worker, event.data);
      worker.onerror = () => this.fail(worker, new Error("Compression worker stopped unexpectedly."));
    }
  }

  async process(file: File, settings: Settings) {
    const buffer = await file.arrayBuffer();
    const request: WorkerRequest = {
      id: crypto.randomUUID(),
      file: buffer,
      mime: file.type,
      name: file.name,
      settings,
    };

    return new Promise<CompressResult>((resolve, reject) => {
      this.queue.push({ request, pending: { resolve, reject } });
      this.pump();
    });
  }

  destroy() {
    this.workers.forEach((worker) => worker.terminate());
    this.queue.splice(0).forEach(({ pending }) => pending.reject(new Error("Processing was cancelled.")));
    this.pending.forEach((pending) => pending.reject(new Error("Processing was cancelled.")));
    this.pending.clear();
  }

  private pump() {
    while (this.idle.length && this.queue.length) {
      const worker = this.idle.pop()!;
      const job = this.queue.shift()!;
      this.pending.set(worker, job.pending);
      worker.postMessage(job.request, [job.request.file]);
    }
  }

  private finish(worker: Worker, response: WorkerResponse) {
    const pending = this.pending.get(worker);
    this.pending.delete(worker);
    this.idle.push(worker);

    if (pending) {
      if (response.ok)
        pending.resolve({
          blob: new Blob([response.output], { type: response.mime }),
          extension: response.extension,
          width: response.width,
          height: response.height,
        });
      else pending.reject(new Error(response.error));
    }
    this.pump();
  }

  private fail(worker: Worker, error: Error) {
    const pending = this.pending.get(worker);
    this.pending.delete(worker);
    this.idle.push(worker);
    pending?.reject(error);
    this.pump();
  }
}
