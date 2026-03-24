import { AFS } from "@aigne/afs";
import { AFSUIProvider, WebBackend } from "@aigne/afs-ui";

const PAUSE = 3000; // ms between steps for visual verification
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const backend = new WebBackend({ port: 9878 });
  await backend.listen();
  const provider = new AFSUIProvider({ backend });
  const afs = new AFS();
  await afs.mount(provider, "/ui");

  console.log("Dock Demo: http://127.0.0.1:9878");
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
    console.error("No browser connected.");
    process.exit(1);
  }

  console.log(`Session: ${sid}`);

  function wmExec(action: string, args: Record<string, unknown> = {}) {
    return afs.exec(`/ui/web/sessions/${sid}/wm/.actions/${action}`, args);
  }

  // ── Phase 1: Initial setup — 4 floating surfaces, macOS style ──
  console.log("\n=== Phase 1: Setup — 4 floating surfaces ===");
  await wmExec("set-style", { style: "macos" });
  await wmExec("set-strategy", { strategy: "floating" });

  await wmExec("open-surface", {
    name: "editor",
    title: "Code Editor",
    position: { x: 50, y: 50 },
    size: { width: 400, height: 300 },
    content: {
      id: "root",
      type: "text",
      props: { content: "Editor — floating surface", level: 3 },
    },
  });
  await wmExec("open-surface", {
    name: "terminal",
    title: "Terminal",
    position: { x: 200, y: 150 },
    size: { width: 400, height: 250 },
    content: {
      id: "root",
      type: "text",
      props: { content: "Terminal — will dock", level: 3 },
    },
  });
  await wmExec("open-surface", {
    name: "browser",
    title: "Browser Preview",
    position: { x: 450, y: 80 },
    size: { width: 450, height: 300 },
    content: {
      id: "root",
      type: "text",
      props: { content: "Browser — will dock", level: 3 },
    },
  });
  await wmExec("open-surface", {
    name: "chat",
    title: "AI Chat",
    position: { x: 100, y: 350 },
    size: { width: 350, height: 280 },
    content: {
      id: "root",
      type: "text",
      props: { content: "Chat — will dock", level: 3 },
    },
  });
  console.log("4 floating surfaces created");
  await wait(PAUSE);

  // ── Phase 2: Pin 3 to dock (bottom, default) ──
  console.log("\n=== Phase 2: Pin 3 surfaces to dock (bottom) ===");
  await wmExec("pin-to-dock", { name: "terminal" });
  await wmExec("pin-to-dock", { name: "browser" });
  await wmExec("pin-to-dock", { name: "chat" });
  console.log("Docked: [terminal, browser, chat], Floating: [editor]");
  await wait(PAUSE);

  // ── Phase 3: Overlay — FLOAT (default) ──
  console.log("\n=== Phase 3: Overlay — FLOAT (default) ===");
  await wmExec("set-dock", { position: "bottom", overlay: "float" });
  console.log("Float mode — dock overlays desktop, no resize");
  await wait(PAUSE);

  // ── Phase 3b: Overlay — PUSH ──
  console.log("\n=== Phase 3b: Overlay — PUSH ===");
  await wmExec("set-dock", { overlay: "push" });
  console.log("Push mode — desktop shrinks to make room for dock");
  await wait(PAUSE);

  // ── Phase 3c: Push + left ──
  console.log("\n=== Phase 3c: Push + LEFT ===");
  await wmExec("set-dock", { position: "left", overlay: "push" });
  console.log("Push mode left — desktop pushed right");
  await wait(PAUSE);

  // ── Phase 3d: Back to float ──
  console.log("\n=== Phase 3d: Back to FLOAT ===");
  await wmExec("set-dock", { position: "bottom", overlay: "float" });
  console.log("Back to float mode");
  await wait(PAUSE);

  // ── Phase 4: Dock position — top ──
  console.log("\n=== Phase 4: Dock position — TOP ===");
  await wmExec("set-dock", { position: "top" });
  console.log("Dock at top");
  await wait(PAUSE);

  // ── Phase 5: Dock position — left ──
  console.log("\n=== Phase 5: Dock position — LEFT ===");
  await wmExec("set-dock", { position: "left" });
  console.log("Dock at left (vertical orientation)");
  await wait(PAUSE);

  // ── Phase 6: Dock position — right ──
  console.log("\n=== Phase 6: Dock position — RIGHT ===");
  await wmExec("set-dock", { position: "right" });
  console.log("Dock at right (vertical orientation)");
  await wait(PAUSE);

  // ── Phase 7: Resize — small dock ──
  console.log("\n=== Phase 7: Resize — small (100px) ===");
  await wmExec("set-dock", { position: "bottom", size: 100 });
  console.log("Dock at bottom, 100px — thumbnails should be small");
  await wait(PAUSE);

  // ── Phase 8: Resize — large dock ──
  console.log("\n=== Phase 8: Resize — large (250px) ===");
  await wmExec("set-dock", { size: 250 });
  console.log("Dock at bottom, 250px — thumbnails should be larger");
  await wait(PAUSE);

  // ── Phase 9: Resize — left, large ──
  console.log("\n=== Phase 9: Resize — left, 300px ===");
  await wmExec("set-dock", { position: "left", size: 300 });
  console.log("Dock at left, 300px — vertical, wide thumbnails");
  await wait(PAUSE);

  // ── Phase 10: Resize — min clamp ──
  console.log("\n=== Phase 10: Resize — below min (30px → clamped to min) ===");
  await wmExec("set-dock", { position: "bottom", size: 30, min: 80 });
  console.log("Set size=30 with min=80 — should clamp to 80");
  await wait(PAUSE);

  // ── Phase 11: Resize — max clamp ──
  console.log("\n=== Phase 11: Resize — above max (800px → clamped to max) ===");
  await wmExec("set-dock", { size: 800, max: 400 });
  console.log("Set size=800 with max=400 — should clamp to 400");
  await wait(PAUSE);

  // ── Phase 12: Live mode — bottom ──
  console.log("\n=== Phase 12: LIVE mode — bottom ===");
  await wmExec("set-dock", { position: "bottom", mode: "live", size: 300 });
  console.log("Live mode at bottom, 300px — surfaces should be interactive");
  await wait(PAUSE * 2);

  // ── Phase 13: Live mode — right ──
  console.log("\n=== Phase 13: LIVE mode — right ===");
  await wmExec("set-dock", { position: "right", mode: "live", size: 400 });
  console.log("Live mode at right, 400px — vertical live surfaces");
  await wait(PAUSE * 2);

  // ── Phase 14: Live mode — top ──
  console.log("\n=== Phase 14: LIVE mode — top ===");
  await wmExec("set-dock", { position: "top", mode: "live", size: 250 });
  console.log("Live mode at top, 250px");
  await wait(PAUSE);

  // ── Phase 15: Live mode — left ──
  console.log("\n=== Phase 15: LIVE mode — left ===");
  await wmExec("set-dock", { position: "left", mode: "live", size: 350 });
  console.log("Live mode at left, 350px");
  await wait(PAUSE);

  // ── Phase 16: Switch back to thumbnail ──
  console.log("\n=== Phase 16: Back to thumbnail mode ===");
  await wmExec("set-dock", { mode: "thumbnail", position: "bottom", size: 140 });
  console.log("Thumbnail mode, bottom, 140px — back to normal");
  await wait(PAUSE);

  // ── Phase 17: Style switch with dock active ──
  console.log("\n=== Phase 17: Style switch with dock ===");
  await wmExec("set-style", { style: "windows" });
  console.log("Windows style — dock should persist");
  await wait(PAUSE);

  await wmExec("set-style", { style: "xwindows" });
  console.log("X Windows style — dock should persist");
  await wait(PAUSE);

  await wmExec("set-style", { style: "minimal" });
  console.log("Minimal style — dock should persist");
  await wait(PAUSE);

  await wmExec("set-style", { style: "macos" });
  console.log("Back to macOS");
  await wait(PAUSE);

  // ── Phase 18: Material presets ──
  console.log("\n=== Phase 18: Material — FROSTED (default) ===");
  await wmExec("set-dock", { position: "bottom", size: 140, appearance: "frosted" });
  console.log("Frosted glass — translucent blur");
  await wait(PAUSE);

  console.log("\n=== Phase 19: Material — LIQUID GLASS ===");
  await wmExec("set-dock", { appearance: "liquid" });
  console.log("Liquid glass — luminous border, inner highlight");
  await wait(PAUSE);

  console.log("\n=== Phase 20: Material — BRUSHED METAL ===");
  await wmExec("set-dock", { appearance: "metal" });
  console.log("Brushed metal — gradient + noise texture");
  await wait(PAUSE);

  console.log("\n=== Phase 21: Material — PLASTIC ===");
  await wmExec("set-dock", { appearance: "plastic" });
  console.log("Plastic — hard border, no blur");
  await wait(PAUSE);

  console.log("\n=== Phase 22: Material — TRANSPARENT ===");
  await wmExec("set-dock", { appearance: "transparent" });
  console.log("Transparent — items float on nothing");
  await wait(PAUSE);

  // ── Phase 23–25: Layout modes ──
  console.log("\n=== Phase 23: Layout — FLOATING ===");
  await wmExec("set-dock", { appearance: "frosted", layout: "floating", shadow: "outer" });
  console.log("Floating — detached from edge, rounded, macOS-like");
  await wait(PAUSE);

  console.log("\n=== Phase 24: Layout — ISLAND ===");
  await wmExec("set-dock", { layout: "island" });
  console.log("Island — pill-shaped, narrow, centered");
  await wait(PAUSE);

  console.log("\n=== Phase 25: Layout — EDGE (default) ===");
  await wmExec("set-dock", { layout: "edge" });
  console.log("Edge — flush to viewport");
  await wait(PAUSE);

  // ── Phase 26–28: Shadow direction ──
  console.log("\n=== Phase 26: Shadow — INSET ===");
  await wmExec("set-dock", { shadow: "inset" });
  console.log("Inset shadow — dock feels sunken into desktop");
  await wait(PAUSE);

  console.log("\n=== Phase 27: Shadow — BOTH ===");
  await wmExec("set-dock", { shadow: "both" });
  console.log("Both shadows — outer + inset combined");
  await wait(PAUSE);

  console.log("\n=== Phase 28: Shadow — NONE ===");
  await wmExec("set-dock", { shadow: "none" });
  console.log("No shadow — flat look");
  await wait(PAUSE);

  // ── Phase 29–30: Handle styles ──
  console.log("\n=== Phase 29: Handle — LINE ===");
  await wmExec("set-dock", { shadow: "outer", handleStyle: "line" });
  console.log("Line handle — single rounded bar");
  await wait(PAUSE);

  console.log("\n=== Phase 30: Handle — GRIP ===");
  await wmExec("set-dock", { handleStyle: "grip" });
  console.log("Grip handle — 3 parallel lines");
  await wait(PAUSE);

  console.log("\n=== Phase 31: Handle — PILL ===");
  await wmExec("set-dock", { handleStyle: "pill" });
  console.log("Pill handle — wide rounded pill");
  await wait(PAUSE);

  // ── Phase 32: Magnification ──
  console.log("\n=== Phase 32: Magnification ON ===");
  await wmExec("set-dock", { handleStyle: "dots", magnify: true, magnifyScale: 1.4 });
  console.log("Hover items to see magnification + adjacent scaling");
  await wait(PAUSE * 2);

  // ── Phase 33: Glow ──
  console.log("\n=== Phase 33: Glow ON ===");
  await wmExec("set-dock", { glow: true });
  console.log("Glow effect on hover — blue aura");
  await wait(PAUSE * 2);

  // ── Phase 34: Item shapes ──
  console.log("\n=== Phase 34: Item shape — ROUNDED ===");
  await wmExec("set-dock", { magnify: false, glow: false, itemShape: "rounded" });
  console.log("Rounded item corners");
  await wait(PAUSE);

  console.log("\n=== Phase 35: Item shape — CIRCLE ===");
  await wmExec("set-dock", { itemShape: "circle" });
  console.log("Circular items");
  await wait(PAUSE);

  // ── Phase 36: Combo — floating + liquid + magnify ──
  console.log("\n=== Phase 36: COMBO — floating + liquid + magnify ===");
  await wmExec("set-dock", {
    layout: "floating",
    appearance: "liquid",
    shadow: "outer",
    magnify: true,
    magnifyScale: 1.3,
    glow: true,
    itemShape: "rounded",
    handleStyle: "pill",
  });
  console.log("Full combo — hover to see all effects");
  await wait(PAUSE * 2);

  // ── Phase 37: Island + metal + circle ──
  console.log("\n=== Phase 37: COMBO — island + metal + circle items ===");
  await wmExec("set-dock", {
    layout: "island",
    appearance: "metal",
    shadow: "both",
    magnify: true,
    glow: false,
    itemShape: "circle",
    handleStyle: "none",
  });
  console.log("Metal island with circular items");
  await wait(PAUSE * 2);

  // ── Phase 38: Autohide ──
  console.log("\n=== Phase 38: Visibility — AUTOHIDE ===");
  await wmExec("set-dock", {
    layout: "edge",
    appearance: "frosted",
    shadow: "outer",
    magnify: false,
    itemShape: "rect",
    handleStyle: "dots",
    visibility: "autohide",
    autohideDelay: 1000,
  });
  console.log("Dock hides after 1s — move mouse to bottom to reveal");
  await wait(PAUSE * 3);

  // ── Phase 39: Peek ──
  console.log("\n=== Phase 39: Visibility — PEEK ===");
  await wmExec("set-dock", { visibility: "peek" });
  console.log("Peek — dock shows a sliver, full on hover");
  await wait(PAUSE * 3);

  // ── Phase 40: Custom colors ──
  console.log("\n=== Phase 40: Custom colors — tinted ===");
  await wmExec("set-dock", {
    visibility: "always",
    appearance: "frosted",
    layout: "floating",
    tint: "rgba(59,130,246,0.8)",
    opacity: 0.2,
    shadow: "outer",
  });
  console.log("Blue-tinted frosted floating dock");
  await wait(PAUSE);

  // ── Phase 41: Reset & unpin ──
  console.log("\n=== Phase 41: Reset — edge frosted, then unpin all ===");
  await wmExec("set-dock", {
    layout: "edge",
    appearance: "frosted",
    shadow: "outer",
    visibility: "always",
    handleStyle: "dots",
    itemShape: "rect",
  });
  await wait(1000);
  await wmExec("unpin-from-dock", { name: "terminal" });
  await wmExec("unpin-from-dock", { name: "browser" });
  await wmExec("unpin-from-dock", { name: "chat" });
  console.log("All unpinned — 4 floating, no dock");
  await wait(PAUSE);

  console.log("\n=== All dock theming tests complete ===");
  console.log("Ctrl+C to stop.");
  await new Promise(() => {});
}
main().catch(console.error);
