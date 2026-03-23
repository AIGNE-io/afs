import { AFS } from "@aigne/afs";
import { AFSUIProvider, WebBackend } from "@aigne/afs-ui";

async function main() {
  const backend = new WebBackend({ port: 9878 });
  await backend.listen();
  const provider = new AFSUIProvider({ backend });
  const afs = new AFS();
  await afs.mount(provider, "/ui");

  console.log("Desktop Demo: http://127.0.0.1:9878");
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
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!sid) {
    console.error("No browser connected.");
    process.exit(1);
  }

  console.log(`Session: ${sid}`);

  function wmExec(action: string, args: Record<string, unknown> = {}) {
    return afs.exec(`/ui/web/sessions/${sid}/wm/.actions/${action}`, args);
  }

  // Set macOS style on root WM
  await wmExec("set-style", { style: "macos" });

  // Create Desktop 1
  await wmExec("create-desktop", { name: "desktop-1", title: "Work", strategy: "panels" });

  // Set explorer layout on desktop-1
  await afs.exec(`/ui/web/sessions/${sid}/wm/.actions/set-layout`, {
    wmId: "desktop-1",
    preset: "explorer",
  });

  // Open surfaces in desktop-1
  await afs.exec(`/ui/web/sessions/${sid}/wm/.actions/open-surface`, {
    wmId: "desktop-1",
    name: "editor-1",
    title: "main.ts",
    panel: "primary",
    content: {
      id: "root",
      type: "view",
      props: { layout: "column" },
      children: [
        { id: "h1", type: "text", props: { content: "main.ts", level: 3 } },
        {
          id: "code",
          type: "text",
          props: { content: 'console.log("Desktop 1 - Work");', format: "text", scale: "sm" },
        },
      ],
    },
  });

  await afs.exec(`/ui/web/sessions/${sid}/wm/.actions/open-surface`, {
    wmId: "desktop-1",
    name: "editor-2",
    title: "utils.ts",
    panel: "primary",
    content: {
      id: "root",
      type: "text",
      props: { content: "export const VERSION = '1.0.0';", format: "text", scale: "sm" },
    },
  });

  await afs.exec(`/ui/web/sessions/${sid}/wm/.actions/open-surface`, {
    wmId: "desktop-1",
    name: "files",
    title: "Files",
    panel: "sidebar",
    content: {
      id: "root",
      type: "view",
      props: { layout: "column" },
      children: [
        { id: "f1", type: "text", props: { content: "src/main.ts", scale: "sm" } },
        { id: "f2", type: "text", props: { content: "src/utils.ts", scale: "sm" } },
      ],
    },
  });

  // Create Desktop 2
  await wmExec("create-desktop", { name: "desktop-2", title: "Browser", strategy: "floating" });

  // Set style on desktop-2
  await afs.exec(`/ui/web/sessions/${sid}/wm/.actions/set-style`, {
    wmId: "desktop-2",
    style: "windows",
  });

  // Open floating windows in desktop-2
  await afs.exec(`/ui/web/sessions/${sid}/wm/.actions/open-surface`, {
    wmId: "desktop-2",
    name: "browser",
    title: "Browser",
    position: { x: 50, y: 50 },
    size: { width: 500, height: 300 },
    content: {
      id: "root",
      type: "text",
      props: { content: "Desktop 2 - Floating Browser Window", level: 3 },
    },
  });

  await afs.exec(`/ui/web/sessions/${sid}/wm/.actions/open-surface`, {
    wmId: "desktop-2",
    name: "notes",
    title: "Notes",
    position: { x: 200, y: 150 },
    size: { width: 400, height: 250 },
    content: {
      id: "root",
      type: "text",
      props: { content: "Desktop 2 - Floating Notes", level: 3 },
    },
  });

  // Create Desktop 3
  await wmExec("create-desktop", { name: "desktop-3", title: "Music", strategy: "floating" });

  await afs.exec(`/ui/web/sessions/${sid}/wm/.actions/open-surface`, {
    wmId: "desktop-3",
    name: "player",
    title: "Music Player",
    position: { x: 100, y: 100 },
    size: { width: 450, height: 280 },
    content: {
      id: "root",
      type: "text",
      props: { content: "Desktop 3 - Music Player", level: 3 },
    },
  });

  // Switch back to desktop-1
  await wmExec("switch-desktop", { name: "desktop-1" });

  console.log(
    "Desktop demo ready! 3 desktops: Work (panels), Browser (floating), Music (floating).",
  );
  console.log("Ctrl+C to stop.");
  await new Promise(() => {});
}
main().catch(console.error);
