import { AFS } from "@aigne/afs";
import { AFSUIProvider, WebBackend } from "@aigne/afs-ui";

async function main() {
  const backend = new WebBackend({ port: 9877 });
  await backend.listen();
  const provider = new AFSUIProvider({ backend });
  const afs = new AFS();
  await afs.mount(provider, "/ui");

  console.log("Strip Demo: http://127.0.0.1:9877");
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

  // Set up panels strategy with explorer layout
  await wmExec("set-strategy", { strategy: "panels" });
  await wmExec("set-layout", { preset: "explorer" });
  await wmExec("set-style", { style: "macos" });

  // Open first surface in primary panel
  await wmExec("open-surface", {
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
          props: {
            content:
              'import { AFS } from "@aigne/afs";\n\nconst fs = new AFS();\nawait fs.mount(provider, "/ui");\n\nconsole.log("Hello AFS!");',
            format: "text",
            scale: "sm",
          },
        },
      ],
    },
  });

  // Open second surface in same panel -> should trigger strip bar
  await wmExec("open-surface", {
    name: "editor-2",
    title: "utils.ts",
    panel: "primary",
    content: {
      id: "root",
      type: "view",
      props: { layout: "column" },
      children: [
        { id: "h1", type: "text", props: { content: "utils.ts", level: 3 } },
        {
          id: "code",
          type: "text",
          props: {
            content:
              'export function greet(name: string) {\n  return `Hello, ${name}!`;\n}\n\nexport const VERSION = "1.0.0";',
            format: "text",
            scale: "sm",
          },
        },
      ],
    },
  });

  // Open third surface in same panel
  await wmExec("open-surface", {
    name: "editor-3",
    title: "config.json",
    panel: "primary",
    content: {
      id: "root",
      type: "text",
      props: {
        content: '{\n  "name": "my-app",\n  "version": "1.0.0",\n  "main": "index.ts"\n}',
        format: "text",
        scale: "sm",
      },
    },
  });

  // Open a surface in sidebar panel
  await wmExec("open-surface", {
    name: "files",
    title: "File Explorer",
    panel: "sidebar",
    content: {
      id: "root",
      type: "view",
      props: { layout: "column" },
      children: [
        { id: "h", type: "text", props: { content: "Files", level: 4 } },
        { id: "f1", type: "text", props: { content: "src/main.ts", scale: "sm" } },
        { id: "f2", type: "text", props: { content: "src/utils.ts", scale: "sm" } },
        { id: "f3", type: "text", props: { content: "config.json", scale: "sm" } },
      ],
    },
  });

  // Open second sidebar surface
  await wmExec("open-surface", {
    name: "search",
    title: "Search",
    panel: "sidebar",
    content: {
      id: "root",
      type: "view",
      props: { layout: "column" },
      children: [
        { id: "h", type: "text", props: { content: "Search Results", level: 4 } },
        { id: "r1", type: "text", props: { content: '3 results for "AFS"', scale: "sm" } },
      ],
    },
  });

  console.log("Strip demo ready! 3 tabs in primary, 2 in sidebar.");
  console.log("Ctrl+C to stop.");
  await new Promise(() => {});
}
main().catch(console.error);
