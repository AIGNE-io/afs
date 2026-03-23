import { AFS } from "@aigne/afs";
import { AFSUIProvider, WebBackend } from "@aigne/afs-ui";

async function main() {
  const backend = new WebBackend({ port: 9876 });
  await backend.listen();
  const provider = new AFSUIProvider({ backend });
  const afs = new AFS();
  await afs.mount(provider, "/ui");

  console.log("WM Demo: http://127.0.0.1:9876");

  let sid: string | null = null;
  for (let i = 0; i < 600; i++) {
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
    console.error("No browser.");
    process.exit(1);
  }

  function wmExec(action: string, args: Record<string, unknown> = {}) {
    return afs.exec(`/ui/web/sessions/${sid}/wm/.actions/${action}`, args);
  }

  const style = process.argv[2] || "neon";
  await wmExec("set-style", { style });

  await wmExec("open-surface", {
    name: "editor",
    title: "Code Editor",
    position: { x: 40, y: 60 },
    size: { width: 480, height: 300 },
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

  await wmExec("open-surface", {
    name: "terminal",
    title: "Terminal",
    position: { x: 560, y: 80 },
    size: { width: 420, height: 240 },
    content: {
      id: "root",
      type: "text",
      props: {
        content:
          "$ bun test\n\n  28 pass\n  0 fail\n  77 expect() calls\n\nRan 28 tests across 1 file. [831ms]",
        format: "text",
        scale: "sm",
      },
    },
  });

  await wmExec("open-surface", {
    name: "dashboard",
    title: "System Monitor",
    position: { x: 120, y: 400 },
    size: { width: 520, height: 240 },
    content: {
      id: "root",
      type: "view",
      props: { layout: "column" },
      children: [
        { id: "h", type: "text", props: { content: "System Performance", level: 4 } },
        {
          id: "p1",
          type: "progress-bar-3d",
          props: { value: 72, color: "cyan", style: "striped", size: "2em" },
        },
        { id: "l1", type: "text", props: { content: "CPU Usage: 72%", scale: "sm" } },
        {
          id: "p2",
          type: "progress-bar-3d",
          props: { value: 45, color: "green", style: "heat", size: "2em" },
        },
        { id: "l2", type: "text", props: { content: "Memory: 45%", scale: "sm" } },
      ],
    },
  });

  console.log(`Style: ${style} | Session: ${sid}\nCtrl+C to stop.`);
  await new Promise(() => {});
}
main().catch(console.error);
