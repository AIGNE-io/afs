/**
 * AFS Explorer Dialog Component
 *
 * Modal dialogs for help, explain output, file view, etc.
 */

import type Blessed from "blessed";
import { formatKeyName, type KeyBindingRegistry } from "../keybindings.js";
import { Colors } from "../theme.js";
import type { ActionItem } from "../types.js";

export interface DialogOptions {
  parent: Blessed.Widgets.Screen;
}

/**
 * Create dialog manager
 */
export function createDialogManager(blessed: typeof Blessed, options: DialogOptions) {
  const { parent } = options;
  let currentDialog: Blessed.Widgets.BoxElement | null = null;
  let currentOverlay: Blessed.Widgets.BoxElement | null = null;
  let currentCloseHandler: (() => void) | null = null;

  /**
   * Create a modal overlay to capture mouse events behind the dialog
   */
  function createOverlay() {
    const overlay = blessed.box({
      parent,
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      mouse: true,
      style: {
        transparent: true,
      },
    });

    // Capture and ignore all mouse events on the overlay
    overlay.on("wheeldown", () => {});
    overlay.on("wheelup", () => {});
    overlay.on("click", () => {});

    return overlay;
  }

  /**
   * Create a basic dialog box
   */
  function createDialog(
    title: string,
    width: string | number,
    height: string | number,
    options?: { skipDefaultKeys?: boolean },
  ) {
    // Create overlay first to capture events behind dialog
    currentOverlay = createOverlay();

    const dialog = blessed.box({
      parent,
      top: "center",
      left: "center",
      width,
      height,
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: " ",
        track: {
          bg: Colors.bg.main,
        },
        style: {
          inverse: true,
        },
      },
      style: {
        fg: Colors.fg.normal,
        bg: Colors.bg.main,
        border: {
          fg: Colors.fg.border,
        },
      },
      border: {
        type: "line",
      },
      label: ` ${title} `,
      shadow: true,
    });

    // Capture mouse events to prevent them from reaching elements behind the dialog
    dialog.on("wheeldown", () => {
      dialog.scroll(1);
      parent.render();
    });
    dialog.on("wheelup", () => {
      dialog.scroll(-1);
      parent.render();
    });

    // Close on escape or q (unless skipped)
    if (!options?.skipDefaultKeys) {
      dialog.key(["escape", "q", "enter"], () => {
        close();
      });
    }

    return dialog;
  }

  /**
   * Close current dialog
   */
  function close(): void {
    // Clean up screen-level key handler if any
    if (currentCloseHandler) {
      parent.unkey("escape", currentCloseHandler);
      parent.unkey("q", currentCloseHandler);
      parent.unkey("enter", currentCloseHandler);
      currentCloseHandler = null;
    }
    if (currentOverlay) {
      currentOverlay.destroy();
      currentOverlay = null;
    }
    if (currentDialog) {
      currentDialog.destroy();
      currentDialog = null;
      parent.render();
    }
  }

  return {
    /**
     * Show help dialog
     */
    showHelp(registry: KeyBindingRegistry): void {
      close();

      const dialog = createDialog("Help - AFS Explorer", "60%", "70%");
      currentDialog = dialog;

      const lines: string[] = [
        " AFS Explorer - Navigate your Agentic File System",
        "",
        " {bold}Commands:{/bold}",
        "",
      ];

      // Get function bar bindings
      const bindings = registry.getFunctionBarBindings();
      for (const binding of bindings) {
        const key = formatKeyName(binding.key).padEnd(6);
        lines.push(`   ${key} ${binding.description}`);
      }

      lines.push("");
      lines.push(" {bold}Navigation:{/bold}");
      lines.push("");
      lines.push("   ↑/k     Move up");
      lines.push("   ↓/j     Move down");
      lines.push("   Enter/l Enter directory or view file");
      lines.push("   Bksp/h  Go to parent directory");
      lines.push("   g/Home  Go to first item");
      lines.push("   G/End   Go to last item");
      lines.push("   ^U/PgUp Page up");
      lines.push("   ^D/PgDn Page down");
      lines.push("");
      lines.push(" {bold}Other:{/bold}");
      lines.push("");
      lines.push("   /       Filter entries");
      lines.push("   ?       Show this help");
      lines.push("");
      lines.push(" {gray-fg}Press Esc, Enter, or Q to close{/gray-fg}");

      dialog.setContent(lines.join("\n"));
      dialog.focus();
      parent.render();
    },

    /**
     * Show explain output dialog
     */
    showExplain(path: string, content: string): void {
      close();

      const dialog = createDialog(`Explain: ${path}`, "80%", "80%");
      currentDialog = dialog;

      dialog.setContent(` ${content.split("\n").join("\n ")}`);
      dialog.focus();
      parent.render();
    },

    /**
     * Show file view dialog
     */
    showFileView(path: string, content: string): void {
      close();

      const dialog = createDialog(`View: ${path}`, "90%", "90%");
      currentDialog = dialog;

      // Add line numbers
      // Escape curly braces in content to prevent blessed tag parsing issues
      const lines = content.split("\n");
      const numbered = lines.map((line, i) => {
        const num = (i + 1).toString().padStart(4);
        // Escape { and } in line content to prevent tag interpretation
        const escaped = line.replace(/\{/g, "\\{").replace(/\}/g, "\\}");
        return `{gray-fg}${num}{/gray-fg} │ ${escaped}`;
      });

      dialog.setContent(numbered.join("\n"));
      dialog.focus();
      parent.render();
    },

    /**
     * Show action result dialog
     */
    showActionResult(action: string, success: boolean, message?: string, data?: unknown): void {
      close();

      // Use skipDefaultKeys and add our own to ensure they work after async callback
      const dialog = createDialog(`Action: ${action}`, "60%", "50%", { skipDefaultKeys: true });
      currentDialog = dialog;

      const lines: string[] = [];

      if (success) {
        lines.push(" {green-fg}✓ Action completed successfully{/green-fg}");
      } else {
        lines.push(" {red-fg}✗ Action failed{/red-fg}");
      }

      if (message) {
        lines.push("");
        lines.push(` ${message}`);
      }

      if (data !== undefined) {
        lines.push("");
        lines.push(" {bold}Result:{/bold}");
        lines.push("");
        const formatted = JSON.stringify(data, null, 2);
        for (const line of formatted.split("\n")) {
          lines.push(`   ${line}`);
        }
      }

      lines.push("");
      lines.push(" {gray-fg}Press Esc, Enter, or Q to close{/gray-fg}");

      dialog.setContent(lines.join("\n"));

      // Use screen-level key handler to ensure it works after async operations
      currentCloseHandler = () => {
        close();
      };
      parent.key(["escape", "q", "enter"], currentCloseHandler);

      dialog.focus();
      parent.render();
    },

    /**
     * Show error dialog
     */
    showError(title: string, error: string): void {
      close();

      const dialog = createDialog(title, "50%", "30%");
      currentDialog = dialog;

      const lines = [
        " {red-fg}Error:{/red-fg}",
        "",
        ` ${error}`,
        "",
        " {gray-fg}Press Esc to close{/gray-fg}",
      ];

      dialog.setContent(lines.join("\n"));
      dialog.focus();
      parent.render();
    },

    /**
     * Show loading indicator
     */
    showLoading(message: string): void {
      close();

      const dialog = createDialog("Loading", "40%", "20%");
      currentDialog = dialog;

      dialog.setContent(`\n   ${message}...`);
      parent.render();
    },

    /**
     * Show confirmation dialog
     */
    showConfirm(message: string, onConfirm: () => void | Promise<void>): void {
      close();

      const dialog = createDialog("Confirm", "50%", "25%", { skipDefaultKeys: true });
      currentDialog = dialog;

      // Track which button is selected (false = No, true = Yes)
      let selectedYes = false;

      const renderContent = () => {
        const yesStyle = selectedYes ? "{inverse} Yes {/inverse}" : " Yes ";
        const noStyle = selectedYes ? " No " : "{inverse} No {/inverse}";

        const lines = [
          "",
          ` ${message}`,
          "",
          `                    [ ${yesStyle} ]    [ ${noStyle} ]`,
          "",
          " {gray-fg}←/→: switch | Enter: confirm | Y/N: quick select | Esc: cancel{/gray-fg}",
        ];

        dialog.setContent(lines.join("\n"));
        parent.render();
      };

      // Initial render
      renderContent();

      // Arrow keys to switch selection
      dialog.key(["left", "right"], () => {
        selectedYes = !selectedYes;
        renderContent();
      });

      // Enter to execute selected action
      dialog.key(["enter"], async () => {
        close();
        if (selectedYes) {
          await onConfirm();
        }
      });

      // Quick select keys
      dialog.key(["y", "Y"], async () => {
        close();
        await onConfirm();
      });
      dialog.key(["n", "N", "escape"], () => {
        close();
      });

      dialog.focus();
      parent.render();
    },

    /**
     * Show params input dialog for exec
     *
     * @param path - Path being executed
     * @param inputSchema - JSON Schema for input parameters
     * @param onSubmit - Callback when params are submitted
     */
    showParamsInput(
      path: string,
      inputSchema: Record<string, unknown> | undefined,
      onSubmit: (params: Record<string, unknown>) => void,
    ): void {
      close();

      // Parse schema to get required and optional properties
      const properties = (inputSchema?.properties as Record<string, unknown>) || {};
      const required = (inputSchema?.required as string[]) || [];
      const propNames = Object.keys(properties);

      // If no properties, show confirmation dialog instead of executing directly
      if (propNames.length === 0) {
        this.showConfirm(`Execute action on ${path}?`, () => {
          onSubmit({});
        });
        return;
      }

      // Calculate dialog height based on number of fields (2 lines per field + header/footer)
      const dialogHeight = Math.min(propNames.length * 3 + 8, 25);
      const dialog = createDialog(`Exec: ${path}`, "70%", dialogHeight, { skipDefaultKeys: true });
      currentDialog = dialog;

      // Create form container (vi: false to allow normal cursor movement)
      const form = blessed.form({
        parent: dialog,
        top: 1,
        left: 1,
        right: 1,
        bottom: 3,
        keys: true,
        vi: false,
      });

      // Custom input state with cursor support
      interface InputState {
        name: string;
        value: string;
        cursor: number;
        box: Blessed.Widgets.BoxElement;
      }
      const inputs: InputState[] = [];
      let yPos = 0;

      for (const propName of propNames) {
        const prop = properties[propName] as Record<string, unknown>;
        const isRequired = required.includes(propName);
        const typeStr = (prop?.type as string) || "string";
        const description = (prop?.description as string) || "";

        // Label with type info
        const reqMark = isRequired ? "{red-fg}*{/red-fg}" : "";
        const labelText = `${propName}${reqMark} {gray-fg}(${typeStr}){/gray-fg}${description ? ` - ${description}` : ""}`;

        blessed.text({
          parent: form,
          top: yPos,
          left: 0,
          tags: true,
          content: labelText,
          style: { fg: Colors.fg.normal },
        });

        yPos += 1;

        // Custom box for input with cursor display
        const inputBox = blessed.box({
          parent: form,
          top: yPos,
          left: 0,
          width: "100%-2",
          height: 1,
          tags: true,
          style: {
            fg: Colors.fg.normal,
            bg: Colors.bg.input,
          },
        });

        inputs.push({ name: propName, value: "", cursor: 0, box: inputBox });
        yPos += 2;
      }

      // Instructions at bottom
      blessed.text({
        parent: dialog,
        bottom: 1,
        left: 1,
        tags: true,
        content: "{gray-fg}Tab: next | ←→: move cursor | Enter: submit | Esc: cancel{/gray-fg}",
      });

      // Track current focused input index
      let focusIndex = 0;

      // Render input with cursor
      const renderInput = (state: InputState, focused: boolean) => {
        if (focused) {
          const before = state.value.slice(0, state.cursor);
          const cursorChar = state.value[state.cursor] || "█";
          const after = state.value.slice(state.cursor + 1);
          // Use white-bg black-fg for cursor visibility
          state.box.setContent(
            `${before}{white-bg}{black-fg}${cursorChar}{/black-fg}{/white-bg}${after}`,
          );
          state.box.style.bg = Colors.bg.inputFocus;
        } else {
          state.box.setContent(state.value || "");
          state.box.style.bg = Colors.bg.input;
        }
      };

      const focusInput = (index: number) => {
        const prevState = inputs[focusIndex];
        const nextState = inputs[index];
        if (nextState) {
          if (prevState) renderInput(prevState, false);
          focusIndex = index;
          renderInput(nextState, true);
          parent.render();
        }
      };

      // Screen-level keypress handler for full input control
      const keypressHandler = (
        ch: string | undefined,
        key: Blessed.Widgets.Events.IKeyEventArg,
      ) => {
        const state = inputs[focusIndex];
        if (!state) return;

        const keyName = key?.name || "";

        // Tab navigation
        if (keyName === "tab") {
          if (key.shift) {
            focusInput((focusIndex - 1 + inputs.length) % inputs.length);
          } else {
            focusInput((focusIndex + 1) % inputs.length);
          }
          return;
        }

        // Submit
        if (keyName === "enter" || keyName === "return") {
          submitForm();
          return;
        }

        // Cancel - handled by dialog.key below
        if (keyName === "escape") {
          return;
        }

        // Cursor movement
        if (keyName === "left") {
          state.cursor = Math.max(0, state.cursor - 1);
          renderInput(state, true);
          parent.render();
          return;
        }
        if (keyName === "right") {
          state.cursor = Math.min(state.value.length, state.cursor + 1);
          renderInput(state, true);
          parent.render();
          return;
        }
        if (keyName === "home") {
          state.cursor = 0;
          renderInput(state, true);
          parent.render();
          return;
        }
        if (keyName === "end") {
          state.cursor = state.value.length;
          renderInput(state, true);
          parent.render();
          return;
        }

        // Backspace
        if (keyName === "backspace") {
          if (state.cursor > 0) {
            state.value = state.value.slice(0, state.cursor - 1) + state.value.slice(state.cursor);
            state.cursor--;
            renderInput(state, true);
            parent.render();
          }
          return;
        }

        // Delete
        if (keyName === "delete") {
          if (state.cursor < state.value.length) {
            state.value = state.value.slice(0, state.cursor) + state.value.slice(state.cursor + 1);
            renderInput(state, true);
            parent.render();
          }
          return;
        }

        // Character input (printable characters)
        if (ch && ch.length === 1 && !key.ctrl && !key.meta) {
          state.value = state.value.slice(0, state.cursor) + ch + state.value.slice(state.cursor);
          state.cursor++;
          renderInput(state, true);
          parent.render();
        }
      };

      const submitForm = () => {
        // Remove keypress handler
        parent.removeListener("keypress", keypressHandler);

        const params: Record<string, unknown> = {};
        for (const { name, value } of inputs) {
          const trimmed = value.trim();
          if (trimmed) {
            // Get the expected type from inputSchema
            const prop = properties[name] as Record<string, unknown> | undefined;
            const expectedType = (prop?.type as string) || "string";

            // Parse value based on expected type
            if (expectedType === "string") {
              // Always keep as string for string type
              params[name] = trimmed;
            } else if (expectedType === "number" || expectedType === "integer") {
              const num = Number(trimmed);
              params[name] = Number.isNaN(num) ? trimmed : num;
            } else if (expectedType === "boolean") {
              params[name] = trimmed.toLowerCase() === "true";
            } else if (expectedType === "object" || expectedType === "array") {
              try {
                params[name] = JSON.parse(trimmed);
              } catch {
                params[name] = trimmed;
              }
            } else {
              // Default: try JSON parse, fallback to string
              try {
                params[name] = JSON.parse(trimmed);
              } catch {
                params[name] = trimmed;
              }
            }
          }
        }

        close();
        onSubmit(params);
      };

      // Override close to clean up handler
      const originalClose = close;
      const closeWithCleanup = () => {
        parent.removeListener("keypress", keypressHandler);
        originalClose();
      };

      // Update dialog escape handler to use cleanup
      dialog.key(["escape"], () => {
        closeWithCleanup();
      });

      // Focus dialog and initialize first input
      // Use setTimeout to avoid capturing the Enter key that triggered this dialog
      dialog.focus();
      parent.render();
      setTimeout(() => {
        parent.on("keypress", keypressHandler);
        focusInput(0);
      }, 50);
    },

    /**
     * Show action picker dialog
     *
     * @param nodePath - Path of the node being acted upon
     * @param actions - List of available actions
     * @param onSelect - Callback when an action is selected
     */
    showActionPicker(
      nodePath: string,
      actions: ActionItem[],
      onSelect: (action: ActionItem) => void,
    ): void {
      close();

      const nodeName = nodePath.split("/").pop() || nodePath;
      const dialogHeight = Math.min(actions.length + 6, 20);
      const dialog = createDialog(`Actions: ${nodeName}`, "50%", dialogHeight, {
        skipDefaultKeys: true,
      });
      currentDialog = dialog;

      // Track selected index
      let selectedIndex = 0;

      const renderContent = () => {
        const lines: string[] = [""];

        for (let i = 0; i < actions.length; i++) {
          const action = actions[i];
          if (!action) continue;

          const prefix = i === selectedIndex ? " {inverse}" : "  ";
          const suffix = i === selectedIndex ? "{/inverse}" : "";
          lines.push(`${prefix}[${i + 1}] ${action.name}${suffix}`);

          // Show description if present
          if (action.description) {
            lines.push(`      {gray-fg}${action.description}{/gray-fg}`);
          }
        }

        lines.push("");
        lines.push(" {gray-fg}↑/↓: select | Enter: execute | Esc: cancel{/gray-fg}");

        dialog.setContent(lines.join("\n"));
        parent.render();
      };

      // Initial render
      renderContent();

      // Navigation
      dialog.key(["up", "k"], () => {
        selectedIndex = (selectedIndex - 1 + actions.length) % actions.length;
        renderContent();
      });

      dialog.key(["down", "j"], () => {
        selectedIndex = (selectedIndex + 1) % actions.length;
        renderContent();
      });

      // Number keys for quick selection (1-9)
      for (let i = 1; i <= Math.min(9, actions.length); i++) {
        dialog.key([String(i)], () => {
          const action = actions[i - 1];
          if (action) {
            close();
            onSelect(action);
          }
        });
      }

      // Enter to select
      dialog.key(["enter"], () => {
        const action = actions[selectedIndex];
        if (action) {
          close();
          onSelect(action);
        }
      });

      // Escape to cancel
      dialog.key(["escape", "q"], () => {
        close();
      });

      dialog.focus();
      parent.render();
    },

    /**
     * Close current dialog
     */
    close,

    /**
     * Check if a dialog is open
     */
    isOpen(): boolean {
      return currentDialog !== null;
    },

    /**
     * Destroy dialog manager
     */
    destroy(): void {
      close();
    },
  };
}

export type DialogManager = ReturnType<typeof createDialogManager>;
