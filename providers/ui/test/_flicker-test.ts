import { AFS } from "@aigne/afs";
import { AFSUIProvider, WebBackend } from "@aigne/afs-ui";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const backend = new WebBackend({ port: 9878 });
  await backend.listen();
  const provider = new AFSUIProvider({ backend });
  const afs = new AFS();
  await afs.mount(provider, "/ui");

  console.log("Flicker Test: http://127.0.0.1:9878");
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

  // Setup: 2 surfaces
  await wmExec("set-style", { style: "macos" });
  await wmExec("set-strategy", { strategy: "floating" });
  await wmExec("open-surface", {
    name: "editor",
    title: "Code Editor",
    position: { x: 50, y: 50 },
    size: { width: 400, height: 300 },
    content: { id: "root", type: "text", props: { content: "Editor content here", level: 3 } },
  });
  await wmExec("open-surface", {
    name: "terminal",
    title: "Terminal",
    position: { x: 200, y: 150 },
    size: { width: 400, height: 250 },
    content: { id: "root", type: "text", props: { content: "Terminal content here", level: 3 } },
  });
  console.log("2 floating surfaces created");
  await wait(2000);

  // Pin to dock
  console.log(">>> PIN terminal to dock");
  await wmExec("pin-to-dock", { name: "terminal" });
  await wait(3000);

  // Unpin from dock
  console.log(">>> UNPIN terminal from dock");
  await wmExec("unpin-from-dock", { name: "terminal" });
  await wait(3000);

  // Pin again
  console.log(">>> PIN terminal again");
  await wmExec("pin-to-dock", { name: "terminal" });
  await wait(3000);

  // Unpin again
  console.log(">>> UNPIN terminal again");
  await wmExec("unpin-from-dock", { name: "terminal" });
  await wait(3000);

  console.log("Done. Ctrl+C to stop.");
  await new Promise(() => {});
}
main().catch(console.error);
