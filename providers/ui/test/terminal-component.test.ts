import { describe, expect, test } from "bun:test";
import { TERMINAL_JS } from "../src/web-page/renderers/terminal.js";

describe("Terminal Component Renderer", () => {
  test("exports non-empty JS string", () => {
    expect(TERMINAL_JS).toContain("renderAupTerminal");
  });

  test("contains xterm CDN URL", () => {
    expect(TERMINAL_JS).toContain("@xterm/xterm@5");
    expect(TERMINAL_JS).toContain("@xterm/addon-fit@0");
  });

  test("requires endpoint prop", () => {
    expect(TERMINAL_JS).toContain("no endpoint configured");
  });

  test("supports readonly mode", () => {
    expect(TERMINAL_JS).toContain("readonly");
  });

  test("uses CSS variable theming", () => {
    expect(TERMINAL_JS).toContain("--bg");
    expect(TERMINAL_JS).toContain("--text");
  });

  test("uses independent WebSocket (not AUP ws)", () => {
    expect(TERMINAL_JS).toContain("new WebSocket(wsUrl)");
    expect(TERMINAL_JS).not.toContain("_fireAupEvent");
  });

  test("has exponential backoff reconnection", () => {
    expect(TERMINAL_JS).toContain("reconnectDelay * 2");
    expect(TERMINAL_JS).toContain("30000");
  });

  test("has cleanup hook for AUP patch removal", () => {
    expect(TERMINAL_JS).toContain("_aupTerminalCleanup");
  });

  test("handles snapshot mode gracefully", () => {
    expect(TERMINAL_JS).toContain("_SNAPSHOT_MODE");
    expect(TERMINAL_JS).toContain("requires live connection");
  });

  test("has full 16-color ANSI theme", () => {
    expect(TERMINAL_JS).toContain("green:");
    expect(TERMINAL_JS).toContain("brightGreen:");
    expect(TERMINAL_JS).toContain("red:");
    expect(TERMINAL_JS).toContain("magenta:");
    expect(TERMINAL_JS).toContain("cyan:");
  });

  test("loads WebGL addon for GPU rendering", () => {
    expect(TERMINAL_JS).toContain("@xterm/addon-webgl@0");
    expect(TERMINAL_JS).toContain("WebglAddon");
  });

  test("supports command history with up/down arrows", () => {
    expect(TERMINAL_JS).toContain("history");
    expect(TERMINAL_JS).toContain("historyIndex");
    expect(TERMINAL_JS).toContain("savedLine");
  });

  test("supports cursor movement (left/right/home/end)", () => {
    expect(TERMINAL_JS).toContain("cursorPos");
    expect(TERMINAL_JS).toContain("_replaceLine");
  });

  test("supports line editing shortcuts (Ctrl-A/E/U/K/W/L)", () => {
    // Ctrl-A (beginning of line)
    expect(TERMINAL_JS).toContain("\\x01");
    // Ctrl-E (end of line)
    expect(TERMINAL_JS).toContain("\\x05");
    // Ctrl-U (kill before cursor)
    expect(TERMINAL_JS).toContain("\\x15");
    // Ctrl-K (kill after cursor)
    expect(TERMINAL_JS).toContain("\\x0b");
    // Ctrl-W (delete word)
    expect(TERMINAL_JS).toContain("\\x17");
    // Ctrl-L (clear screen)
    expect(TERMINAL_JS).toContain("\\x0c");
  });

  test("handles Delete key", () => {
    expect(TERMINAL_JS).toContain("\\x1b[3~");
  });

  test("has CJK / fullwidth display-width helpers", () => {
    expect(TERMINAL_JS).toContain("function _cw(");
    expect(TERMINAL_JS).toContain("function _sw(");
  });

  test("uses responsive height (100%)", () => {
    expect(TERMINAL_JS).toContain('height = "100%"');
  });
});
