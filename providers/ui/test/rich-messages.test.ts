/**
 * Rich Messages — format-aware write tests for WebBackend.
 *
 * Tests: html, markdown, component formats; security (sanitization);
 * TTY rejection; WebSocket message shape.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { AFS } from "@aigne/afs";
import { AFSUIProvider, createMockInputSource, TTYBackend, WebBackend } from "@aigne/afs-ui";
import { WebSocket } from "ws";

/* ─── helpers ──────────────────────────────────────────── */

function makeWebBackend(opts?: { collectOutput?: string[] }) {
  const output = opts?.collectOutput ?? [];
  const inputSource = createMockInputSource(["test input"]);
  const stdout = {
    write(data: string) {
      output.push(data);
      return true;
    },
  };
  return { backend: new WebBackend({ port: 0, inputSource, stdout }), output, inputSource };
}

function makeTTYBackend() {
  const output: string[] = [];
  const inputSource = createMockInputSource(["test input"]);
  const stdout = {
    write(data: string) {
      output.push(data);
      return true;
    },
  };
  return { backend: new TTYBackend({ inputSource, stdout }), output };
}

/* ─── WebSocket helpers ──────────────────────────────────── */

let serverBackend: WebBackend | null = null;
let serverPort = 0;

function connectWs(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${serverPort}`);
    socket.on("error", reject);
    socket.on("open", () => {
      socket.send(JSON.stringify({ type: "join_session" }));
      resolve(socket);
    });
  });
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    socket.once("message", (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}

afterEach(async () => {
  if (serverBackend) {
    await serverBackend.close();
    serverBackend = null;
  }
});

/* ─── Happy Path ─────────────────────────────────────── */

describe("Rich Messages — Happy Path", () => {
  test("write with format='html' succeeds on web backend", async () => {
    const { backend } = makeWebBackend();
    await backend.write("<b>bold</b>", { format: "html" });
    // No throw = success
  });

  test("write with format='markdown' succeeds on web backend", async () => {
    const { backend } = makeWebBackend();
    await backend.write("# Hello", { format: "markdown" });
  });

  test("write with format='component' + component='code-block' succeeds", async () => {
    const { backend } = makeWebBackend();
    await backend.write("const x = 1;", {
      format: "component",
      component: "code-block",
      componentProps: { language: "typescript" },
    });
  });

  test("write with format='component' + component='table' succeeds", async () => {
    const { backend } = makeWebBackend();
    await backend.write("", {
      format: "component",
      component: "table",
      componentProps: {
        headers: ["Name", "Age"],
        rows: [
          ["Alice", "30"],
          ["Bob", "25"],
        ],
      },
    });
  });

  test("write with format='component' + component='image' succeeds", async () => {
    const { backend } = makeWebBackend();
    await backend.write("", {
      format: "component",
      component: "image",
      componentProps: { src: "https://example.com/img.png", alt: "Example" },
    });
  });

  test("meta('/') declares supportedFormats containing html/markdown/component", async () => {
    const { backend } = makeWebBackend();
    const afs = new AFS();
    const provider = new AFSUIProvider({ backend });
    await afs.mount(provider, "/ui");

    const result = await afs.read("/ui/.meta");
    const formats = result.data?.meta?.supportedFormats as string[];
    expect(formats).toContain("html");
    expect(formats).toContain("markdown");
    expect(formats).toContain("component");
    expect(formats).toContain("text");
  });

  test("mixed text->html->markdown->text sequence preserves order", async () => {
    const output: string[] = [];
    const { backend } = makeWebBackend({ collectOutput: output });

    await backend.write("plain", { format: "text" });
    await backend.write("<b>bold</b>", { format: "html" });
    await backend.write("# Title", { format: "markdown" });
    await backend.write("end", { format: "text" });

    expect(output).toEqual(["plain", "<b>bold</b>", "# Title", "end"]);
  });

  test("WebSocket message includes format field", async () => {
    serverBackend = new WebBackend({ port: 0 });
    const info = await serverBackend.listen();
    serverPort = info.port;

    const ws = await connectWs();
    try {
      const msgPromise = nextMessage(ws);
      await serverBackend.write("**bold**", { format: "markdown" });
      const msg = await msgPromise;

      expect(msg.type).toBe("write");
      expect(msg.content).toBe("**bold**");
      expect(msg.format).toBe("markdown");
    } finally {
      ws.terminate();
    }
  });

  test("WebSocket message includes component and componentProps", async () => {
    serverBackend = new WebBackend({ port: 0 });
    const info = await serverBackend.listen();
    serverPort = info.port;

    const ws = await connectWs();
    try {
      const msgPromise = nextMessage(ws);
      await serverBackend.write("code", {
        format: "component",
        component: "code-block",
        componentProps: { language: "js" },
      });
      const msg = await msgPromise;

      expect(msg.type).toBe("write");
      expect(msg.format).toBe("component");
      expect(msg.component).toBe("code-block");
      expect((msg.componentProps as Record<string, unknown>).language).toBe("js");
    } finally {
      ws.terminate();
    }
  });

  test("write with format='text' still works (backward compat)", async () => {
    const { backend, output } = makeWebBackend({ collectOutput: [] });
    await backend.write("hello", { format: "text" });
    expect(output).toEqual(["hello"]);
  });

  test("write with no format still works (defaults to text)", async () => {
    const { backend, output } = makeWebBackend({ collectOutput: [] });
    await backend.write("hello");
    expect(output).toEqual(["hello"]);
  });
});

/* ─── Bad Path ───────────────────────────────────────── */

describe("Rich Messages — Bad Path", () => {
  test("write with unsupported format throws", async () => {
    const { backend } = makeWebBackend();
    await expect(backend.write("x", { format: "pdf" })).rejects.toThrow("does not support format");
  });

  test("write with format='component' but no component type throws", async () => {
    const { backend } = makeWebBackend();
    await expect(backend.write("x", { format: "component" })).rejects.toThrow("component");
  });

  test("write with format='component' and unknown component throws", async () => {
    const { backend } = makeWebBackend();
    await expect(
      backend.write("x", { format: "component", component: "unknown-widget" }),
    ).rejects.toThrow("component");
  });

  test("write with format='html' on TTY backend throws", async () => {
    const { backend } = makeTTYBackend();
    await expect(backend.write("x", { format: "html" })).rejects.toThrow("does not support format");
  });

  test("write with format='markdown' on TTY backend throws", async () => {
    const { backend } = makeTTYBackend();
    await expect(backend.write("x", { format: "markdown" })).rejects.toThrow(
      "does not support format",
    );
  });
});

/* ─── Security ───────────────────────────────────────── */

describe("Rich Messages — Security", () => {
  test("html format strips <script> tags in WS message", async () => {
    serverBackend = new WebBackend({ port: 0 });
    const info = await serverBackend.listen();
    serverPort = info.port;

    const ws = await connectWs();
    try {
      const msgPromise = nextMessage(ws);
      await serverBackend.write('<p>hello</p><script>alert("xss")</script>', { format: "html" });
      const msg = await msgPromise;

      // Content should be sanitized server-side before sending
      const content = msg.content as string;
      expect(content).not.toContain("<script");
      expect(content).toContain("<p>hello</p>");
    } finally {
      ws.terminate();
    }
  });

  test("html format strips on* event attributes in WS message", async () => {
    serverBackend = new WebBackend({ port: 0 });
    const info = await serverBackend.listen();
    serverPort = info.port;

    const ws = await connectWs();
    try {
      const msgPromise = nextMessage(ws);
      await serverBackend.write(
        '<img src="x" onerror="alert(1)"><div onclick="steal()">click</div>',
        { format: "html" },
      );
      const msg = await msgPromise;

      const content = msg.content as string;
      expect(content).not.toContain("onerror");
      expect(content).not.toContain("onclick");
    } finally {
      ws.terminate();
    }
  });

  test("html format blocks javascript: URLs in WS message", async () => {
    serverBackend = new WebBackend({ port: 0 });
    const info = await serverBackend.listen();
    serverPort = info.port;

    const ws = await connectWs();
    try {
      const msgPromise = nextMessage(ws);
      await serverBackend.write('<a href="javascript:alert(1)">click me</a>', { format: "html" });
      const msg = await msgPromise;

      const content = msg.content as string;
      expect(content).not.toContain("javascript:");
    } finally {
      ws.terminate();
    }
  });

  test("html format blocks unquoted javascript: URLs in WS message", async () => {
    serverBackend = new WebBackend({ port: 0 });
    const info = await serverBackend.listen();
    serverPort = info.port;

    const ws = await connectWs();
    try {
      const msgPromise = nextMessage(ws);
      await serverBackend.write("<a href=javascript:alert(1)>click me</a>", { format: "html" });
      const msg = await msgPromise;

      const content = msg.content as string;
      expect(content).not.toContain("javascript:");
    } finally {
      ws.terminate();
    }
  });

  test("html sanitization in test mode also strips scripts", async () => {
    const output: string[] = [];
    const { backend } = makeWebBackend({ collectOutput: output });
    await backend.write("<p>safe</p><script>bad()</script>", { format: "html" });
    const content = output[0]!;
    expect(content).not.toContain("<script");
    expect(content).toContain("<p>safe</p>");
  });
});

/* ─── AFS Integration ────────────────────────────────── */

describe("Rich Messages — AFS Integration", () => {
  test("write via AFS with format in meta", async () => {
    const output: string[] = [];
    const inputSource = createMockInputSource(["test"]);
    const stdout = {
      write(data: string) {
        output.push(data);
        return true;
      },
    };
    const backend = new WebBackend({ port: 0, inputSource, stdout });

    const afs = new AFS();
    const provider = new AFSUIProvider({ backend });
    await afs.mount(provider, "/ui");

    await afs.write("/ui/output", {
      content: "# Hello World",
      meta: { format: "markdown" },
    });

    expect(output[0]).toBe("# Hello World");
  });

  test("write via AFS with component in meta", async () => {
    const output: string[] = [];
    const inputSource = createMockInputSource(["test"]);
    const stdout = {
      write(data: string) {
        output.push(data);
        return true;
      },
    };
    const backend = new WebBackend({ port: 0, inputSource, stdout });

    const afs = new AFS();
    const provider = new AFSUIProvider({ backend });
    await afs.mount(provider, "/ui");

    await afs.write("/ui/output", {
      content: "const x = 1;",
      meta: {
        format: "component",
        component: "code-block",
        componentProps: { language: "typescript" },
      },
    });

    expect(output[0]).toBe("const x = 1;");
  });
});
