/**
 * TTY Backend unit tests.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { AFS } from "@aigne/afs";
import { AFSUIProvider, createMockInputSource } from "@aigne/afs-ui";

describe("TTY Backend", () => {
  let afs: AFS;
  let outputBuffer: string[];
  let inputSource: ReturnType<typeof createMockInputSource>;

  function createProvider() {
    outputBuffer = [];
    inputSource = createMockInputSource();
    return new AFSUIProvider({
      backend: "tty",
      ttyOptions: {
        stdout: {
          write(data: string) {
            outputBuffer.push(data);
            return true;
          },
        },
        inputSource,
      },
    });
  }

  beforeEach(async () => {
    afs = new AFS();
    await afs.mount(createProvider(), "/ui");
  });

  describe("read/write", () => {
    test("write to /output sends to stdout", async () => {
      await afs.write("/ui/output", { content: "hello world" });
      expect(outputBuffer.join("")).toContain("hello world");
    });

    test("read from /input returns user input", async () => {
      inputSource.push("user says hi");
      const result = await afs.read("/ui/input");
      expect(result.data?.content).toBe("user says hi");
    });

    test("write empty content does not throw", async () => {
      await afs.write("/ui/output", { content: "" });
      // Should not throw
    });

    test("consecutive writes output in order", async () => {
      await afs.write("/ui/output", { content: "first" });
      await afs.write("/ui/output", { content: "second" });
      await afs.write("/ui/output", { content: "third" });
      const allOutput = outputBuffer.join("");
      const firstIdx = allOutput.indexOf("first");
      const secondIdx = allOutput.indexOf("second");
      const thirdIdx = allOutput.indexOf("third");
      expect(firstIdx).toBeLessThan(secondIdx);
      expect(secondIdx).toBeLessThan(thirdIdx);
    });
  });

  describe("meta", () => {
    test("meta('/') returns device capabilities", async () => {
      const result = await afs.read("/ui/.meta");
      const meta = result.data?.meta;
      expect(meta?.kind).toBe("device");
      expect(meta?.backend).toBe("tty");
      expect(meta?.supportedFormats).toEqual(["text"]);
      expect(meta?.capabilities).toEqual(["text"]);
    });
  });

  describe("stat", () => {
    test("stat('/input') shows pending status", async () => {
      const result = await afs.stat("/ui/input");
      expect(result.data?.meta?.pending).toBe(false);

      inputSource.push("buffered");
      const result2 = await afs.stat("/ui/input");
      expect(result2.data?.meta?.pending).toBe(true);
    });
  });

  describe("explain", () => {
    test("explain('/') returns human-readable description", async () => {
      const result = await afs.explain("/ui");
      expect(result.content).toContain("UI Device");
      expect(result.content).toContain("tty");
    });
  });

  describe("actions", () => {
    test("prompt text returns user input", async () => {
      inputSource.push("Alice");
      const result = await afs.exec("/ui/.actions/prompt", {
        message: "Name?",
        type: "text",
      });
      expect(result.data?.response).toBe("Alice");
      expect(outputBuffer.join("")).toContain("Name?");
    });

    test("prompt confirm returns boolean", async () => {
      inputSource.push("y");
      const result = await afs.exec("/ui/.actions/prompt", {
        message: "Sure?",
        type: "confirm",
      });
      expect(result.data?.response).toBe(true);
    });

    test("prompt confirm 'n' returns false", async () => {
      inputSource.push("n");
      const result = await afs.exec("/ui/.actions/prompt", {
        message: "Sure?",
        type: "confirm",
      });
      expect(result.data?.response).toBe(false);
    });

    test("prompt select returns selected option", async () => {
      inputSource.push("2");
      const result = await afs.exec("/ui/.actions/prompt", {
        message: "Pick",
        type: "select",
        options: ["a", "b", "c"],
      });
      expect(result.data?.response).toBe("b");
    });

    test("clear sends ANSI escape", async () => {
      await afs.exec("/ui/.actions/clear", {});
      const output = outputBuffer.join("");
      expect(output).toContain("\x1b[2J");
    });

    test("notify sends message to output", async () => {
      await afs.exec("/ui/.actions/notify", { message: "Done" });
      expect(outputBuffer.join("")).toContain("Done");
    });

    test("prompt without message throws", async () => {
      await expect(afs.exec("/ui/.actions/prompt", {})).rejects.toThrow("message");
    });

    test("prompt with invalid type throws", async () => {
      await expect(
        afs.exec("/ui/.actions/prompt", { message: "X", type: "invalid" }),
      ).rejects.toThrow();
    });

    test("notify without message throws", async () => {
      await expect(afs.exec("/ui/.actions/notify", {})).rejects.toThrow("message");
    });
  });

  describe("list", () => {
    test("list('/') returns input and output", async () => {
      const result = await afs.list("/ui");
      const ids = result.data.map((e) => e.id);
      expect(ids).toContain("input");
      expect(ids).toContain("output");
    });
  });

  describe("error handling", () => {
    test("read nonexistent path throws not found", async () => {
      await expect(afs.read("/ui/nonexistent")).rejects.toThrow();
    });

    test("write to unsupported format throws", async () => {
      // TTY backend only supports "text" format
      const provider = createProvider();
      await expect(
        provider.write?.("/output", { content: "<html>", meta: { format: "html" } }),
      ).rejects.toThrow("format");
    });
  });
});
