/**
 * AFS Explorer Screen
 *
 * Main screen controller that manages all UI components and user interaction.
 */

import type { AFS } from "@aigne/afs";
import blessed from "blessed";
import { colors } from "../ui/index.js";
import {
  createInitialState,
  executeAction,
  getExplain,
  loadDirectory,
  loadMetadata,
  navigation,
  readFileContent,
} from "./actions.js";
import {
  createDialogManager,
  createFileList,
  createFunctionBar,
  createMetadataPanel,
  createStatusBar,
} from "./components/index.js";
import { createDefaultRegistry } from "./keybindings.js";
import { createStore } from "./state.js";
import type { ActionItem } from "./types.js";

export interface ExplorerScreenOptions {
  afs: AFS;
  startPath?: string;
  version: string;
  /** Custom input stream (for remote/WebSocket sessions). */
  input?: NodeJS.ReadableStream;
  /** Custom output stream (for remote/WebSocket sessions). */
  output?: NodeJS.WritableStream;
  /** Terminal type override. */
  terminal?: string;
  /** Called when the screen is destroyed (instead of process.exit). */
  onExit?: () => void;
}

/**
 * Create and run the explorer screen
 */
export async function createExplorerScreen(options: ExplorerScreenOptions): Promise<void> {
  const { afs, startPath = "/", version } = options;
  const isRemote = !!(options.input || options.output);

  // Create store with initial state
  const store = createStore(createInitialState(startPath));

  // Create key binding registry
  const registry = createDefaultRegistry();

  // Create blessed screen
  // Use 'xterm' terminal to avoid Setulc parsing warnings with xterm-256color
  const screenOpts: Record<string, unknown> = {
    smartCSR: true,
    title: "AFS Explorer",
    terminal: options.terminal || "xterm",
    fullUnicode: true,
    warnings: false,
  };
  if (options.input) screenOpts.input = options.input;
  if (options.output) screenOpts.output = options.output;
  const screen = blessed.screen(screenOpts);

  // Create components
  const _statusBar = createStatusBar(blessed, {
    parent: screen,
    store,
    width: "100%",
    top: 0,
  });

  const fileList = createFileList(blessed, {
    parent: screen,
    store,
    width: "70%",
    height: "100%-2",
    top: 1,
    left: 0,
  });

  const metadataPanel = createMetadataPanel(blessed, {
    parent: screen,
    width: "30%",
    height: "100%-2",
    top: 1,
    right: 0,
  });

  const _functionBar = createFunctionBar(blessed, {
    parent: screen,
    registry,
    width: "100%",
    bottom: 0,
  });

  const dialogs = createDialogManager(blessed, {
    parent: screen,
  });

  // Get mount count
  const mountCount = afs.getMounts().length;

  // Load initial directory
  async function loadPath(path: string): Promise<void> {
    store.setState({ loading: true, error: undefined });

    const result = await loadDirectory(afs, path);

    store.setState({
      currentPath: path,
      entries: result.entries,
      selectedIndex: 0,
      scrollOffset: 0,
      loading: false,
      error: result.error,
    });

    // Update metadata panel for first entry
    updateMetadata();
  }

  // Update metadata panel for selected entry
  async function updateMetadata(): Promise<void> {
    const selected = navigation.getSelected(store.getState());
    if (selected) {
      const metadata = await loadMetadata(afs, selected);
      metadataPanel.update(selected, metadata);
    } else {
      metadataPanel.clear();
    }
  }

  // Handle navigation
  async function handleEnter(): Promise<void> {
    const selected = navigation.getSelected(store.getState());
    if (!selected) return;

    if (selected.type === "directory" || selected.type === "up") {
      await loadPath(selected.path);
    } else if (selected.type === "file") {
      await handleView();
    }
  }

  // Handle back navigation
  async function handleBack(): Promise<void> {
    const state = store.getState();
    const parentPath = navigation.getParentPath(state.currentPath);
    if (parentPath !== state.currentPath) {
      await loadPath(parentPath);
    }
  }

  // Handle view action (F3)
  async function handleView(): Promise<void> {
    const selected = navigation.getSelected(store.getState());
    if (!selected || selected.type === "up") return;

    if (selected.type === "file") {
      // Read file content directly
      // For parameterized content (like prompts with args), use F4 (Exec) to execute with params
      dialogs.showLoading("Loading file");
      const result = await readFileContent(afs, selected.path);
      if (result.error) {
        dialogs.showError("View Error", result.error);
      } else {
        dialogs.showFileView(selected.path, result.content);
      }
    } else if (selected.type === "directory") {
      // Enter directory
      await loadPath(selected.path);
    }
  }

  // Handle explain action (F2)
  async function handleExplain(): Promise<void> {
    const selected = navigation.getSelected(store.getState());
    if (!selected || selected.type === "up") return;

    dialogs.showLoading("Getting explain info");
    const result = await getExplain(afs, selected.path);
    if (result.error) {
      dialogs.showError("Explain Error", result.error);
    } else {
      dialogs.showExplain(selected.path, result.content);
    }
  }

  // Execute a single action (used by unified F4)
  async function runAction(item: ActionItem): Promise<void> {
    // Show params form if inputSchema exists (even if no properties - for confirmation)
    if (item.inputSchema) {
      dialogs.showParamsInput(item.path, item.inputSchema, async (params) => {
        dialogs.showLoading("Executing action");
        const result = await executeAction(afs, item.path, item.name, params);
        dialogs.showActionResult(item.name, result.success, result.message, result.data);
      });
    } else {
      // No inputSchema - execute directly
      dialogs.showLoading("Executing action");
      const result = await executeAction(afs, item.path, item.name);
      dialogs.showActionResult(item.name, result.success, result.message, result.data);
    }
  }

  // Handle exec action (F4/x) - Unified logic
  async function handleExec(): Promise<void> {
    const selected = navigation.getSelected(store.getState());
    if (!selected || selected.type === "up") return;

    // Load enriched metadata (includes actions from stat)
    const metadata = await loadMetadata(afs, selected);

    // Build actions list - prefer enriched metadata.actions over selected.actions
    const actionItems: ActionItem[] = [];
    const actions = metadata?.actions ?? selected.actions;

    // 1. Add node's own actions (from enriched metadata or initial list)
    if (actions && actions.length > 0) {
      for (const action of actions) {
        // If action doesn't have inputSchema, try to load it from stat
        let inputSchema = action.inputSchema as Record<string, unknown> | undefined;
        if (!inputSchema) {
          try {
            const actionPath = `${selected.path}/.actions/${action.name}`;
            const actionStat = await afs.stat(actionPath);
            inputSchema = actionStat.data?.meta?.inputSchema as Record<string, unknown> | undefined;
          } catch {
            // Ignore - action might not have inputSchema
          }
        }

        actionItems.push({
          name: action.name,
          path: `${selected.path}/.actions/${action.name}`,
          description: action.description,
          inputSchema,
        });
      }
    }

    // 2. If node is exec type, add default "Execute" action
    if (selected.type === "exec") {
      const inputSchema = metadata?.extra?.inputSchema as Record<string, unknown> | undefined;

      actionItems.push({
        name: "Execute",
        path: selected.path,
        description: "Execute this node directly",
        inputSchema,
      });
    }

    // 3. If no actions available, show error
    if (actionItems.length === 0) {
      dialogs.showError("No Actions", `${selected.name} has no available actions`);
      return;
    }

    // 4. If only one action, execute directly
    if (actionItems.length === 1) {
      await runAction(actionItems[0]!);
      return;
    }

    // 5. Multiple actions - show picker
    dialogs.showActionPicker(selected.path, actionItems, async (item) => {
      await runAction(item);
    });
  }

  // Handle refresh action (F5)
  async function handleRefresh(): Promise<void> {
    const state = store.getState();
    await loadPath(state.currentPath);
  }

  // Action handlers map
  const actionHandlers: Record<string, () => void | Promise<void>> = {
    help: () => dialogs.showHelp(registry),
    explain: handleExplain,
    view: handleView,
    exec: handleExec,
    refresh: handleRefresh,
    quit: () => {
      dialogs.showConfirm("Are you sure you want to quit?", async () => {
        // If onExit callback provided, use it instead of process.exit
        // This allows embedding explore in a REPL without killing the process
        if (isRemote || options.onExit) {
          screen.destroy();
          options.onExit?.();
          return;
        }
        // Prepare farewell message before destroying screen (match header.ts format)
        const logo = colors.brightCyan("▄▀█ █▀▀ █▀\n█▀█ █▀░ ▄█\n");
        const tagline = colors.dim("Agentic File System");
        const versionPart = colors.green(`v${version}`);
        const mountPart = colors.yellow(`${mountCount} ${mountCount === 1 ? "mount" : "mounts"}`);
        const statusLine = `${versionPart} ${colors.dim("•")} ${mountPart}`;
        const farewell = `\n${logo}${tagline}\n\n${statusLine}\n${colors.dim("Thanks for using AFS Explorer!")}\n`;
        // Destroy screen and immediately print
        screen.destroy();
        process.stdout.write(farewell);
        process.exit(0);
      });
    },
    "nav:up": () => {
      store.setState(navigation.up(store.getState()));
      updateMetadata();
    },
    "nav:down": () => {
      store.setState(navigation.down(store.getState()));
      updateMetadata();
    },
    "nav:enter": handleEnter,
    "nav:back": handleBack,
    "nav:home": () => {
      store.setState(navigation.home(store.getState()));
      updateMetadata();
    },
    "nav:end": () => {
      store.setState(navigation.end(store.getState()));
      updateMetadata();
    },
    "nav:pageup": () => {
      store.setState(navigation.pageUp(store.getState(), fileList.getVisibleHeight()));
      updateMetadata();
    },
    "nav:pagedown": () => {
      store.setState(navigation.pageDown(store.getState(), fileList.getVisibleHeight()));
      updateMetadata();
    },
    cancel: () => {
      if (dialogs.isOpen()) {
        dialogs.close();
      } else {
        // ESC on main screen triggers quit with confirmation
        actionHandlers.quit?.();
      }
    },
  };

  // Bind keys
  screen.on("keypress", async (ch, key) => {
    // Skip if dialog is handling keys
    if (dialogs.isOpen()) return;

    const keyName = key.name || ch;
    if (!keyName) return;

    // Note: Not passing full context since default bindings don't have conditions
    const binding = registry.getBindingForKey(keyName);

    if (binding) {
      const handler = actionHandlers[binding.action];
      if (handler) {
        await handler();
        screen.render();
      }
    }
  });

  // Handle resize
  screen.on("resize", () => {
    screen.render();
  });

  // Focus file list
  fileList.focus();

  // Load initial directory
  await loadPath(startPath);

  // Render
  screen.render();

  // Return promise that resolves when screen is destroyed
  return new Promise((resolve) => {
    screen.on("destroy", () => {
      resolve();
    });
  });
}
