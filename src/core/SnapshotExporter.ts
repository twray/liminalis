interface CapturedSnapshot {
  dataUrl: string;
  fileName: string;
}

interface SnapshotExporterOptions {
  fileNamePrefix?: string;
  mimeType?: string;
  quality?: number;
}

const DEFAULT_FILE_NAME_PREFIX = "liminalis-snapshot";
const DEFAULT_MIME_TYPE = "image/png";

class SnapshotExporter {
  #fileNamePrefix: string;
  #mimeType: string;
  #quality: number | undefined;

  constructor(options: SnapshotExporterOptions = {}) {
    this.#fileNamePrefix = options.fileNamePrefix ?? DEFAULT_FILE_NAME_PREFIX;
    this.#mimeType = options.mimeType ?? DEFAULT_MIME_TYPE;
    this.#quality = options.quality;
  }

  capture(canvas: HTMLCanvasElement): CapturedSnapshot {
    if (typeof canvas.toDataURL !== "function") {
      throw new Error("Canvas image export API is not available.");
    }

    const dataUrl = canvas.toDataURL(this.#mimeType, this.#quality);

    if (
      typeof dataUrl !== "string" ||
      dataUrl.length === 0 ||
      dataUrl === "data:,"
    ) {
      throw new Error("Snapshot capture failed.");
    }

    return {
      dataUrl,
      fileName: this.#buildFileName(),
    };
  }

  download(dataUrl: string, fileName: string): void {
    if (
      typeof document === "undefined" ||
      typeof document.createElement !== "function"
    ) {
      throw new Error("Document API is not available for snapshot download.");
    }

    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = fileName;
    anchor.click();
  }

  captureAndDownload(canvas: HTMLCanvasElement): string {
    const { dataUrl, fileName } = this.capture(canvas);
    this.download(dataUrl, fileName);
    return fileName;
  }

  #buildFileName(): string {
    return `${this.#fileNamePrefix}-${Date.now()}.${this.#getFileExtension()}`;
  }

  #getFileExtension(): string {
    if (this.#mimeType === "image/jpeg") {
      return "jpg";
    }

    if (this.#mimeType === "image/webp") {
      return "webp";
    }

    return "png";
  }
}

export default SnapshotExporter;
