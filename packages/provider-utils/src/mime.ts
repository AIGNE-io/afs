import { getPlatform } from "@aigne/afs";

const MIME_TYPES: Record<string, string> = {
  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  // Documents
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  // Code
  js: "text/javascript",
  ts: "text/typescript",
  json: "application/json",
  html: "text/html",
  css: "text/css",
  xml: "text/xml",
};

const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
  "ico",
  "pdf",
  "zip",
  "tar",
  "gz",
  "exe",
  "dll",
  "so",
  "dylib",
  "wasm",
]);

function getExtension(filePath: string): string {
  return getPlatform().path.basename(filePath).split(".").pop()?.toLowerCase() || "";
}

export function getMimeType(filePath: string): string {
  return MIME_TYPES[getExtension(filePath)] || "application/octet-stream";
}

export function isBinaryFile(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(getExtension(filePath));
}
