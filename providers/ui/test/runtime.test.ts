/**
 * AFSRuntime unit tests.
 *
 * Tests the minimal event loop: read input → handler → write output.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { AFS } from "@aigne/afs";
import { AFSRuntime, AFSUIProvider, createMockInputSource } from "@aigne/afs-ui";

describe("AFSRuntime", () => {
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

  /** Helper: wait for async processing */
  const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));

  describe("happy path", () => {
    test("on() registers handler and returns this for chaining", () => {
      const runtime = new AFSRuntime(afs);
      const result = runtime.on("/ui", async () => "ok");
      expect(result).toBe(runtime);
    });

    test("start() begins reading loop and handler receives input", async () => {
      const runtime = new AFSRuntime(afs);
      const received: string[] = [];

      runtime.on("/ui", async (input) => {
        received.push(input);
        return `Got: ${input}`;
      });

      inputSource.push("hello");
      await runtime.start();
      await tick();

      expect(received).toContain("hello");
      expect(outputBuffer.join("")).toContain("Got: hello");

      await runtime.stop();
    });

    test("handler return value is written to device output", async () => {
      const runtime = new AFSRuntime(afs);
      runtime.on("/ui", async (input) => `Reply: ${input}`);

      inputSource.push("test message");
      await runtime.start();
      await tick();

      expect(outputBuffer.join("")).toContain("Reply: test message");
      await runtime.stop();
    });

    test("stop() stops the loop", async () => {
      const runtime = new AFSRuntime(afs);
      runtime.on("/ui", async () => null);

      inputSource.push("once");
      await runtime.start();
      expect(runtime.isRunning).toBe(true);

      await tick();
      await runtime.stop();
      expect(runtime.isRunning).toBe(false);
    });

    test("multiple start/stop cycles work", async () => {
      const runtime = new AFSRuntime(afs);
      const received: string[] = [];

      runtime.on("/ui", async (input) => {
        received.push(input);
        return null;
      });

      // Cycle 1
      inputSource.push("cycle1");
      await runtime.start();
      await tick();
      await runtime.stop();

      // Cycle 2
      inputSource.push("cycle2");
      await runtime.start();
      await tick();
      await runtime.stop();

      expect(received).toContain("cycle1");
      expect(received).toContain("cycle2");
    });

    test("full interaction: input → handler → output", async () => {
      const runtime = new AFSRuntime(afs);

      runtime.on("/ui", async (input) => {
        if (input === "hello") return "Hi there!";
        if (input === "bye") return "Goodbye!";
        return "Unknown";
      });

      inputSource.push("hello");
      inputSource.push("bye");

      await runtime.start();
      await tick(100);

      const output = outputBuffer.join("");
      expect(output).toContain("Hi there!");
      expect(output).toContain("Goodbye!");

      await runtime.stop();
    });
  });

  describe("bad path", () => {
    test("start() with no handlers throws", async () => {
      const runtime = new AFSRuntime(afs);
      await expect(runtime.start()).rejects.toThrow("No handlers registered");
    });

    test("start() with non-existent device path throws", async () => {
      const runtime = new AFSRuntime(afs);
      runtime.on("/nonexistent", async () => "");
      await expect(runtime.start()).rejects.toThrow();
    });

    test("handler error does not crash runtime, error written to output", async () => {
      const runtime = new AFSRuntime(afs);
      let callCount = 0;

      runtime.on("/ui", async (input) => {
        callCount++;
        if (callCount === 1) throw new Error("Handler failed");
        return `OK: ${input}`;
      });

      inputSource.push("first"); // triggers error
      inputSource.push("second"); // should still work

      await runtime.start();
      await tick(100);

      expect(callCount).toBe(2);
      const output = outputBuffer.join("");
      expect(output).toContain("Error: Handler failed");
      expect(output).toContain("OK: second");

      await runtime.stop();
    });

    test("start() while already running throws", async () => {
      const runtime = new AFSRuntime(afs);
      runtime.on("/ui", async () => null);

      inputSource.push("keep-alive");
      await runtime.start();

      await expect(runtime.start()).rejects.toThrow("already running");

      await runtime.stop();
    });
  });

  describe("edge cases", () => {
    test("handler returning undefined produces no output", async () => {
      const runtime = new AFSRuntime(afs);
      runtime.on("/ui", async () => undefined);

      inputSource.push("test");
      await runtime.start();
      await tick();

      // No write to /output → outputBuffer empty
      expect(outputBuffer.length).toBe(0);
      await runtime.stop();
    });

    test("handler returning null produces no output", async () => {
      const runtime = new AFSRuntime(afs);
      runtime.on("/ui", async () => null);

      inputSource.push("test");
      await runtime.start();
      await tick();

      expect(outputBuffer.length).toBe(0);
      await runtime.stop();
    });

    test("async handler is correctly awaited — sequential processing", async () => {
      const runtime = new AFSRuntime(afs);
      const order: string[] = [];

      runtime.on("/ui", async (input) => {
        order.push(`start:${input}`);
        await new Promise((r) => setTimeout(r, 20));
        order.push(`end:${input}`);
        return `Done: ${input}`;
      });

      inputSource.push("a");
      inputSource.push("b");

      await runtime.start();
      await tick(200);

      // Must process sequentially: start a → end a → start b → end b
      expect(order).toEqual(["start:a", "end:a", "start:b", "end:b"]);
      await runtime.stop();
    });

    test("stop() waits for current handler to complete", async () => {
      const runtime = new AFSRuntime(afs);
      let handlerCompleted = false;

      runtime.on("/ui", async () => {
        await new Promise((r) => setTimeout(r, 80));
        handlerCompleted = true;
        return "done";
      });

      inputSource.push("process");
      await runtime.start();

      // Give handler time to start but not finish
      await tick(20);

      // Stop while handler is still running
      await runtime.stop();

      // Handler should have completed before stop() resolved
      expect(handlerCompleted).toBe(true);
    });

    test("rapid consecutive inputs are all processed", async () => {
      const runtime = new AFSRuntime(afs);
      const received: string[] = [];

      runtime.on("/ui", async (input) => {
        received.push(input);
        return null;
      });

      for (let i = 0; i < 10; i++) {
        inputSource.push(`msg-${i}`);
      }

      await runtime.start();
      await tick(200);

      expect(received.length).toBe(10);
      for (let i = 0; i < 10; i++) {
        expect(received).toContain(`msg-${i}`);
      }

      await runtime.stop();
    });
  });

  describe("security", () => {
    test("handler error does not expose runtime internals", async () => {
      const runtime = new AFSRuntime(afs);

      runtime.on("/ui", async () => {
        throw new Error("Custom error message");
      });

      inputSource.push("test");
      await runtime.start();
      await tick();

      const output = outputBuffer.join("");
      expect(output).toContain("Custom error message");
      // Should not leak internal class/method names
      expect(output).not.toContain("runLoop");
      expect(output).not.toContain("AFSRuntime");

      await runtime.stop();
    });
  });
});
