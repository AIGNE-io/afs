/**
 * AFSUI Provider Conformance Tests
 *
 * Uses the unified provider testing framework (runProviderTests) to verify
 * that AFSUIProvider conforms to the AFS provider interface contract.
 */
import { describe } from "bun:test";
import { runProviderTests } from "@aigne/afs-testing";
import { AFSUIProvider, createMockInputSource } from "@aigne/afs-ui";
import { setupPlayground } from "./playground.js";

describe("AFSUI Conformance (TTY)", () => {
  runProviderTests({
    name: "AFSUI-TTY",
    providerClass: AFSUIProvider,
    playground: setupPlayground,

    createProvider() {
      // Pre-populate enough mock inputs for conformance tests:
      // - ReadOperations reads all leaf nodes including /input
      // - Various validation suites also read /input
      // - Action tests execute prompt which also reads input
      // - Dialog/form actions also consume inputs
      const inputSource = createMockInputSource([
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "test input",
        "Alice", // for prompt action test
        "1", // for dialog action test (selects first button)
        "Bob",
        "25", // for form action test
      ]);

      return new AFSUIProvider({
        backend: "tty",
        ttyOptions: {
          stdout: { write: () => true },
          inputSource,
        },
      });
    },

    structure: {
      root: {
        name: "",
        meta: {
          kind: "device",
          childrenCount: 12,
        },
        children: [
          {
            name: "tty",
            meta: {
              kind: "endpoint",
            },
            children: [
              {
                name: "sessions",
                meta: {
                  kind: "sessions-directory",
                },
              },
            ],
          },
          {
            name: "primitives",
            meta: {
              kind: "primitives-directory",
              childrenCount: 15,
            },
          },
          {
            name: "components",
            meta: {
              kind: "components-directory",
              childrenCount: 22,
            },
          },
          {
            name: "style",
            meta: {
              kind: "style-directory",
              childrenCount: 3,
            },
          },
          {
            name: "themes",
            meta: {
              kind: "themes-directory",
              childrenCount: 20,
            },
          },
          {
            name: "overlay-themes",
            meta: {
              kind: "overlay-themes-directory",
            },
          },
          {
            name: "input",
            meta: {
              kind: "input-channel",
              childrenCount: 0,
            },
          },
          {
            name: "output",
            meta: {
              kind: "output-channel",
              childrenCount: 0,
            },
          },
          {
            name: "pages",
            meta: {
              kind: "pages-directory",
              childrenCount: 0,
            },
          },
          {
            name: "spec",
            meta: {
              kind: "aup:spec",
            },
          },
          {
            name: "examples",
            meta: {
              kind: "examples-directory",
            },
          },
          {
            name: "sharing",
            meta: {
              kind: "sharing-directory",
              childrenCount: 0,
            },
          },
        ],
        actions: [
          { name: "prompt", description: "Ask user a question" },
          { name: "clear", description: "Clear screen" },
          { name: "notify", description: "Send notification" },
          { name: "navigate", description: "Navigate to a managed page" },
          { name: "dialog", description: "Show dialog with custom buttons" },
          { name: "progress", description: "Display/update progress indicator" },
          { name: "form", description: "Collect structured input via form" },
          { name: "table", description: "Display tabular data" },
          { name: "toast", description: "Show lightweight toast notification" },
        ],
      },
    },

    writeCases: [
      {
        name: "write text to output",
        path: "/output",
        payload: { content: "hello world" },
        expected: { contentContains: "hello world" },
      },
      {
        name: "write empty content to output",
        path: "/output",
        payload: { content: "" },
        expected: { content: "" },
      },
    ],

    actionCases: [
      {
        name: "prompt text input",
        path: "/.actions/prompt",
        args: { message: "Name?", type: "text" },
        expected: { success: true },
      },
      {
        name: "clear screen",
        path: "/.actions/clear",
        args: {},
        expected: { success: true },
      },
      {
        name: "send notification",
        path: "/.actions/notify",
        args: { message: "Done" },
        expected: { success: true },
      },
      {
        name: "dialog with buttons",
        path: "/.actions/dialog",
        args: { title: "Confirm", content: "Sure?", buttons: ["OK", "Cancel"] },
        expected: { success: true },
      },
      {
        name: "progress update",
        path: "/.actions/progress",
        args: { label: "Loading", value: 50, max: 100 },
        expected: { success: true },
      },
      {
        name: "form input",
        path: "/.actions/form",
        args: {
          title: "Info",
          fields: [
            { name: "name", label: "Name", type: "text" },
            { name: "age", label: "Age", type: "text" },
          ],
        },
        expected: { success: true },
      },
      {
        name: "table display",
        path: "/.actions/table",
        args: { headers: ["Col"], rows: [["val"]] },
        expected: { success: true },
      },
      {
        name: "toast notification",
        path: "/.actions/toast",
        args: { message: "Done!" },
        expected: { success: true },
      },
    ],

    config: {
      timeout: 10000,
    },
  });
});
