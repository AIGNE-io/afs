import { AFS } from "@aigne/afs";
import { AFSUIProvider, WebBackend } from "@aigne/afs-ui";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const backend = new WebBackend({ port: 9878 });
  await backend.listen();
  const provider = new AFSUIProvider({ backend });
  const afs = new AFS();
  await afs.mount(provider, "/ui");

  console.log("Verify Fixes: http://127.0.0.1:9878");
  console.log("Waiting for browser...");

  let sid: string | null = null;
  for (let i = 0; i < 120; i++) {
    try {
      const sessions = await afs.list("/ui/web/sessions");
      if (sessions.data.length > 0) {
        sid = sessions.data[0]!.id;
        break;
      }
    } catch {}
    await wait(500);
  }
  if (!sid) {
    console.error("No browser.");
    process.exit(1);
  }
  console.log(`Session: ${sid}`);

  function wmExec(action: string, args: Record<string, unknown> = {}) {
    return afs.exec(`/ui/web/sessions/${sid}/wm/.actions/${action}`, args);
  }

  // Setup: 2 floating surfaces with macOS style
  await wmExec("set-style", { style: "macos" });
  await wmExec("set-strategy", { strategy: "floating" });
  await wmExec("open-surface", {
    name: "editor",
    title: "Code Editor",
    position: { x: 50, y: 50 },
    size: { width: 500, height: 350 },
    content: { id: "root", type: "text", props: { content: "Editor - stays floating", level: 3 } },
  });
  await wmExec("open-surface", {
    name: "terminal",
    title: "Terminal",
    position: { x: 250, y: 180 },
    size: { width: 500, height: 300 },
    content: {
      id: "root",
      type: "text",
      props: { content: "Terminal - will be docked/undocked", level: 3 },
    },
  });
  console.log("2 floating surfaces created. Waiting 2s...");
  await wait(2000);

  // Pin terminal to dock
  console.log(">>> PIN terminal to dock");
  await wmExec("pin-to-dock", { name: "terminal" });
  console.log("Terminal is now docked. Dock visible at bottom.");
  console.log("");
  console.log("=== VERIFY: Dock is visible. Hover handle to test. ===");
  console.log("Waiting indefinitely. Ctrl+C to stop.");
  await new Promise(() => {});
}
main().catch(console.error);
