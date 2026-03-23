import type {
  PromptOptions,
  PromptResult,
  ReadOptions,
  UIBackend,
  ViewportInfo,
  WriteOptions,
} from "./backend.js";

/**
 * TTY Backend — stdin/stdout based terminal I/O.
 *
 * For testing, provide mock stdin/stdout via options.
 */
export interface TTYBackendOptions {
  /** Custom writable stream (defaults to process.stdout) */
  stdout?: { write(data: string): boolean };
  /** Custom input source for testing */
  inputSource?: TTYInputSource;
  /** Input timeout in ms (0 = no timeout) */
  inputTimeout?: number;
}

/**
 * Input source abstraction for testability.
 * In production, reads from process.stdin.
 * In tests, provides programmatic input.
 */
export interface TTYInputSource {
  /** Read a line of input */
  readLine(): Promise<string>;
  /** Check if input is available */
  hasPending(): boolean;
}

export class TTYBackend implements UIBackend {
  readonly type = "tty";
  readonly supportedFormats = ["text"];
  readonly capabilities = ["text"];

  private stdout: { write(data: string): boolean };
  private inputSource: TTYInputSource;
  private inputTimeout: number;

  constructor(options: TTYBackendOptions = {}) {
    this.stdout = options.stdout ?? process.stdout;
    this.inputSource = options.inputSource ?? createStdinSource();
    this.inputTimeout = options.inputTimeout ?? 0;
  }

  async write(content: string, options?: WriteOptions): Promise<void> {
    if (options?.format && options.format !== "text") {
      throw new Error(`TTY backend does not support format: ${options.format}`);
    }
    this.stdout.write(content);
  }

  async read(options?: ReadOptions): Promise<string> {
    const timeout = options?.timeout ?? this.inputTimeout;
    if (timeout > 0) {
      return withTimeout(this.inputSource.readLine(), timeout);
    }
    return this.inputSource.readLine();
  }

  async prompt(options: PromptOptions): Promise<PromptResult> {
    const { message, type } = options;

    switch (type) {
      case "text":
      case "password": {
        this.stdout.write(`${message} `);
        const input = await this.read();
        return input.trim();
      }
      case "confirm": {
        this.stdout.write(`${message} (y/n) `);
        const input = await this.read();
        return input.trim().toLowerCase().startsWith("y");
      }
      case "select": {
        if (!options.options || options.options.length === 0) {
          throw new Error("select prompt requires options");
        }
        this.stdout.write(`${message}\n`);
        for (let i = 0; i < options.options.length; i++) {
          this.stdout.write(`  ${i + 1}. ${options.options[i]}\n`);
        }
        this.stdout.write("Choice: ");
        const input = await this.read();
        const idx = Number.parseInt(input.trim(), 10) - 1;
        if (idx >= 0 && idx < options.options.length) {
          return options.options[idx]!;
        }
        return options.options[0]!;
      }
      case "multiselect": {
        if (!options.options || options.options.length === 0) {
          throw new Error("multiselect prompt requires options");
        }
        this.stdout.write(`${message}\n`);
        for (let i = 0; i < options.options.length; i++) {
          this.stdout.write(`  ${i + 1}. ${options.options[i]}\n`);
        }
        this.stdout.write("Choices (comma-separated): ");
        const input = await this.read();
        const indices = input
          .split(",")
          .map((s) => Number.parseInt(s.trim(), 10) - 1)
          .filter((i) => i >= 0 && i < options.options!.length);
        return indices.map((i) => options.options![i]!);
      }
      default:
        throw new Error(`Unknown prompt type: ${type}`);
    }
  }

  async notify(message: string): Promise<void> {
    this.stdout.write(`${message}\n`);
  }

  async clear(): Promise<void> {
    // ANSI escape: clear screen + move cursor to top-left
    this.stdout.write("\x1b[2J\x1b[H");
  }

  hasPendingInput(): boolean {
    return this.inputSource.hasPending();
  }

  getViewport(): ViewportInfo {
    if (typeof process !== "undefined" && process.stdout && "columns" in process.stdout) {
      return {
        cols: (process.stdout as { columns?: number }).columns,
        rows: (process.stdout as { rows?: number }).rows,
      };
    }
    return {};
  }

  async dispose(): Promise<void> {
    // No cleanup needed for TTY
  }
}

/** Create a stdin-based input source (production use) */
function createStdinSource(): TTYInputSource {
  const pendingLines: string[] = [];
  let pendingResolve: ((line: string) => void) | null = null;

  if (typeof process !== "undefined" && process.stdin) {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (data: string) => {
      const lines = data.split("\n").filter((l) => l.length > 0);
      for (const line of lines) {
        if (pendingResolve) {
          const resolve = pendingResolve;
          pendingResolve = null;
          resolve(line);
        } else {
          pendingLines.push(line);
        }
      }
    });
  }

  return {
    readLine(): Promise<string> {
      if (pendingLines.length > 0) {
        return Promise.resolve(pendingLines.shift()!);
      }
      return new Promise((resolve) => {
        pendingResolve = resolve;
      });
    },
    hasPending(): boolean {
      return pendingLines.length > 0;
    },
  };
}

/** Create a mock input source for testing */
export function createMockInputSource(inputs: string[] = []): TTYInputSource & {
  push(line: string): void;
} {
  const queue = [...inputs];
  let pendingResolve: ((line: string) => void) | null = null;

  return {
    readLine(): Promise<string> {
      if (queue.length > 0) {
        return Promise.resolve(queue.shift()!);
      }
      return new Promise((resolve) => {
        pendingResolve = resolve;
      });
    },
    hasPending(): boolean {
      return queue.length > 0;
    },
    push(line: string): void {
      if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve(line);
      } else {
        queue.push(line);
      }
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Input timeout")), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
