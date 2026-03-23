import type { AFS } from "@aigne/afs";
import { joinURL } from "ufo";

/**
 * Handler function for processing user input.
 * Return a string to write to device output, or null/undefined to skip output.
 */
export type RuntimeHandler = (
  input: string,
) => string | void | null | undefined | Promise<string | void | null | undefined>;

/**
 * AFSRuntime — minimal event loop for UI device interaction.
 *
 * Reads input from a mounted UI device, dispatches to a registered handler,
 * and writes the handler's response back to device output.
 *
 * Usage:
 *   const runtime = new AFSRuntime(afs);
 *   runtime.on("/ui", async (input) => `Echo: ${input}`);
 *   await runtime.start();
 *   // ... running ...
 *   await runtime.stop();
 */
export class AFSRuntime {
  private afs: AFS;
  private handlers = new Map<string, RuntimeHandler>();
  private running = false;
  private stopRequested = false;
  private loopPromise: Promise<void> | null = null;
  private resolveStop: (() => void) | null = null;
  private stopSignal: Promise<void> | null = null;

  /**
   * Orphaned read promises from previous stop/start cycles.
   * When the loop is blocked on read() and stop() is called, the read
   * promise is preserved here so the next start() can consume it
   * instead of losing the input.
   */
  private orphanedReads = new Map<string, Promise<string>>();

  constructor(afs: AFS) {
    this.afs = afs;
  }

  /** Whether the runtime is currently running. */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Register a handler for a device mount path.
   * The handler receives user input and optionally returns a response.
   */
  on(devicePath: string, handler: RuntimeHandler): this {
    this.handlers.set(devicePath, handler);
    return this;
  }

  /**
   * Start the event loop. Validates all registered device paths,
   * then begins reading input and dispatching to handlers.
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error("Runtime is already running");
    }
    if (this.handlers.size === 0) {
      throw new Error("No handlers registered");
    }

    // Validate all device paths exist by stat-ing the input channel
    for (const path of this.handlers.keys()) {
      await this.afs.stat(joinURL(path, "input"));
    }

    this.running = true;
    this.stopRequested = false;
    this.stopSignal = new Promise((resolve) => {
      this.resolveStop = resolve;
    });

    this.loopPromise = this.runLoops();
  }

  /**
   * Stop the event loop. Waits for any in-progress handler to complete.
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    this.stopRequested = true;
    this.resolveStop?.();

    if (this.loopPromise) {
      await this.loopPromise;
    }

    this.running = false;
    this.loopPromise = null;
    this.resolveStop = null;
    this.stopSignal = null;
  }

  private async runLoops(): Promise<void> {
    const loops = [...this.handlers.entries()].map(([path, handler]) =>
      this.runLoop(path, handler),
    );
    await Promise.allSettled(loops);
  }

  private async runLoop(devicePath: string, handler: RuntimeHandler): Promise<void> {
    const inputPath = joinURL(devicePath, "input");
    const outputPath = joinURL(devicePath, "output");

    while (!this.stopRequested) {
      let input: string;

      // Check for an orphaned read from a previous stop/start cycle
      const orphaned = this.orphanedReads.get(devicePath);
      if (orphaned) {
        this.orphanedReads.delete(devicePath);
        input = await orphaned;
      } else {
        // Race between reading input and the stop signal
        const readPromise = this.afs.read(inputPath).then((r) => String(r.data?.content ?? ""));

        const result = await Promise.race([
          readPromise.then((value) => ({ stopped: false as const, value })),
          this.stopSignal!.then(() => ({ stopped: true as const, value: "" })),
        ]);

        if (result.stopped || this.stopRequested) {
          // Preserve the orphaned read for the next cycle
          this.orphanedReads.set(devicePath, readPromise);
          break;
        }

        input = result.value;
      }

      try {
        const response = await handler(input);
        if (response != null) {
          await this.afs.write(outputPath, { content: String(response) });
        }
      } catch (err) {
        // Write error to device output; don't crash the loop
        const message = err instanceof Error ? err.message : String(err);
        try {
          await this.afs.write(outputPath, { content: `Error: ${message}` });
        } catch {
          // If even error output fails, silently continue
        }
      }
    }
  }
}
