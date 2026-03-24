import { describe, expect, test } from "bun:test";
import { getMimeType, isBinaryFile } from "@aigne/afs-provider-utils";

describe("getMimeType", () => {
  test("returns correct MIME for image extensions", () => {
    expect(getMimeType("photo.png")).toBe("image/png");
    expect(getMimeType("photo.jpg")).toBe("image/jpeg");
    expect(getMimeType("photo.jpeg")).toBe("image/jpeg");
    expect(getMimeType("anim.gif")).toBe("image/gif");
    expect(getMimeType("icon.bmp")).toBe("image/bmp");
    expect(getMimeType("modern.webp")).toBe("image/webp");
    expect(getMimeType("logo.svg")).toBe("image/svg+xml");
    expect(getMimeType("fav.ico")).toBe("image/x-icon");
  });

  test("returns correct MIME for document extensions", () => {
    expect(getMimeType("doc.pdf")).toBe("application/pdf");
    expect(getMimeType("notes.txt")).toBe("text/plain");
    expect(getMimeType("readme.md")).toBe("text/markdown");
  });

  test("returns correct MIME for code extensions", () => {
    expect(getMimeType("app.js")).toBe("text/javascript");
    expect(getMimeType("app.ts")).toBe("text/typescript");
    expect(getMimeType("data.json")).toBe("application/json");
    expect(getMimeType("page.html")).toBe("text/html");
    expect(getMimeType("style.css")).toBe("text/css");
    expect(getMimeType("feed.xml")).toBe("text/xml");
  });

  test("returns application/octet-stream for unknown extensions", () => {
    expect(getMimeType("file.xyz")).toBe("application/octet-stream");
    expect(getMimeType("file.abc123")).toBe("application/octet-stream");
  });

  test("returns application/octet-stream for files with no extension", () => {
    expect(getMimeType("Makefile")).toBe("application/octet-stream");
    expect(getMimeType("LICENSE")).toBe("application/octet-stream");
  });

  test("handles case insensitivity", () => {
    expect(getMimeType("photo.PNG")).toBe("image/png");
    expect(getMimeType("photo.Jpg")).toBe("image/jpeg");
    expect(getMimeType("doc.PDF")).toBe("application/pdf");
    expect(getMimeType("page.HTML")).toBe("text/html");
  });

  test("handles paths with directories", () => {
    expect(getMimeType("/path/to/photo.png")).toBe("image/png");
    expect(getMimeType("src/app.ts")).toBe("text/typescript");
  });

  test("handles dotfiles", () => {
    expect(getMimeType(".gitignore")).toBe("application/octet-stream");
  });
});

describe("isBinaryFile", () => {
  test("returns true for binary extensions", () => {
    const binaryFiles = [
      "photo.png",
      "img.jpg",
      "img.jpeg",
      "anim.gif",
      "img.bmp",
      "img.webp",
      "fav.ico",
      "doc.pdf",
      "archive.zip",
      "archive.tar",
      "archive.gz",
      "prog.exe",
      "lib.dll",
      "lib.so",
      "lib.dylib",
      "mod.wasm",
    ];
    for (const file of binaryFiles) {
      expect(isBinaryFile(file)).toBe(true);
    }
  });

  test("returns false for text extensions", () => {
    const textFiles = ["readme.md", "app.ts", "style.css", "data.json", "page.html", "notes.txt"];
    for (const file of textFiles) {
      expect(isBinaryFile(file)).toBe(false);
    }
  });

  test("returns false for files with no extension", () => {
    expect(isBinaryFile("Makefile")).toBe(false);
  });

  test("handles case insensitivity", () => {
    expect(isBinaryFile("photo.PNG")).toBe(true);
    expect(isBinaryFile("archive.ZIP")).toBe(true);
  });

  test("handles paths with directories", () => {
    expect(isBinaryFile("/path/to/photo.png")).toBe(true);
    expect(isBinaryFile("src/app.ts")).toBe(false);
  });
});
