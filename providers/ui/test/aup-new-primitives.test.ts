/**
 * Phase 4: New fundamental primitives — time, chart, map, calendar.
 *
 * Tests validation, tree storage, and web-page.ts renderer presence.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { AFS } from "@aigne/afs";
import { AFSUIProvider, validateNode, WEB_CLIENT_HTML, type WebBackend } from "@aigne/afs-ui";
import { WebSocket } from "ws";

// ─── Helpers ──────────────────────────────────────────────────

let afs: AFS | null = null;
let backend: WebBackend | null = null;
let serverInfo: { port: number };

async function setup() {
  afs = new AFS();
  const provider = new AFSUIProvider({ backend: "web", webOptions: { port: 0 } });
  await afs.mount(provider, "/ui");
  await provider.ready();
  backend = (provider as unknown as { backend: WebBackend }).backend;
  const url = backend.url!;
  serverInfo = { port: Number.parseInt(new URL(url).port, 10) };
}

afterEach(async () => {
  if (backend) {
    await backend.close();
    backend = null;
  }
  afs = null;
});

function connectWs(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${serverInfo.port}`);
    ws.on("error", reject);
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "join_session" }));
      resolve(ws);
    });
  });
}

function nextMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ws.once("message", (data) => resolve(JSON.parse(data.toString())));
  });
}

function afsRequest(ws: WebSocket, msg: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const reqId = msg.reqId as string;
    const timeout = setTimeout(() => reject(new Error("afsRequest timeout")), 5000);
    const handler = (data: unknown) => {
      const parsed = JSON.parse(String(data)) as Record<string, unknown>;
      if ((parsed.type === "afs_result" || parsed.type === "afs_error") && parsed.reqId === reqId) {
        clearTimeout(timeout);
        ws.off("message", handler);
        resolve(parsed);
      }
    };
    ws.on("message", handler);
    ws.send(JSON.stringify(msg));
  });
}

// ─── Validation Tests ─────────────────────────────────────────

describe("New primitive node validation", () => {
  describe("time primitive", () => {
    test("accepts time node in display mode", () => {
      expect(
        validateNode({
          id: "t1",
          type: "time",
          props: { mode: "display", value: "2026-02-21T12:00:00Z" },
        }),
      ).toBeNull();
    });

    test("accepts time node in clock mode", () => {
      expect(validateNode({ id: "t2", type: "time", props: { mode: "clock" } })).toBeNull();
    });

    test("accepts time node in countdown mode", () => {
      expect(
        validateNode({
          id: "t3",
          type: "time",
          props: { mode: "countdown", target: "2026-12-31T23:59:59Z" },
        }),
      ).toBeNull();
    });

    test("accepts time node in timer mode", () => {
      expect(validateNode({ id: "t4", type: "time", props: { mode: "timer" } })).toBeNull();
    });

    test("accepts time node in picker mode", () => {
      expect(validateNode({ id: "t5", type: "time", props: { mode: "picker" } })).toBeNull();
    });

    test("accepts time node in analog-clock mode", () => {
      expect(validateNode({ id: "t6", type: "time", props: { mode: "analog-clock" } })).toBeNull();
    });

    test("accepts time node in analog-clock mode with locale", () => {
      expect(
        validateNode({ id: "t7", type: "time", props: { mode: "analog-clock", locale: "zh-CN" } }),
      ).toBeNull();
    });

    test("accepts time node in analog-clock mode with static value", () => {
      expect(
        validateNode({
          id: "t8",
          type: "time",
          props: { mode: "analog-clock", value: "2026-03-05T14:30:00Z" },
        }),
      ).toBeNull();
    });

    test("accepts time node in calendar mode", () => {
      expect(validateNode({ id: "t9", type: "time", props: { mode: "calendar" } })).toBeNull();
    });

    test("accepts time node in calendar mode with locale", () => {
      expect(
        validateNode({
          id: "t10",
          type: "time",
          props: { mode: "calendar", locale: "en-US" },
        }),
      ).toBeNull();
    });

    test("accepts time node in calendar mode with static value", () => {
      expect(
        validateNode({
          id: "t11",
          type: "time",
          props: { mode: "calendar", value: "2026-12-25T00:00:00Z" },
        }),
      ).toBeNull();
    });
  });

  describe("chart primitive", () => {
    test("accepts chart node with line variant", () => {
      expect(
        validateNode({
          id: "c1",
          type: "chart",
          props: { variant: "line" },
          src: "/monitoring/cpu",
        }),
      ).toBeNull();
    });

    test("accepts chart node with bar variant and data", () => {
      expect(
        validateNode({
          id: "c2",
          type: "chart",
          props: {
            variant: "bar",
            data: {
              labels: ["A", "B", "C"],
              datasets: [{ label: "Sales", data: [10, 20, 30] }],
            },
          },
        }),
      ).toBeNull();
    });

    test("accepts chart node with pie variant", () => {
      expect(validateNode({ id: "c3", type: "chart", props: { variant: "pie" } })).toBeNull();
    });
  });

  describe("map primitive", () => {
    test("accepts map node with center and zoom", () => {
      expect(
        validateNode({
          id: "m1",
          type: "map",
          props: { center: [51.505, -0.09], zoom: 13 },
        }),
      ).toBeNull();
    });

    test("accepts map node with markers", () => {
      expect(
        validateNode({
          id: "m2",
          type: "map",
          props: {
            center: [40.7128, -74.006],
            zoom: 12,
            markers: [{ lat: 40.7128, lng: -74.006, label: "NYC" }],
          },
        }),
      ).toBeNull();
    });

    test("accepts map with src binding for live data", () => {
      expect(
        validateNode({
          id: "m3",
          type: "map",
          src: "/fleet/vehicles",
          props: { center: [0, 0], zoom: 2 },
        }),
      ).toBeNull();
    });
  });

  describe("calendar primitive", () => {
    test("accepts calendar node in month mode", () => {
      expect(validateNode({ id: "cal1", type: "calendar", props: { mode: "month" } })).toBeNull();
    });

    test("accepts calendar node with events", () => {
      expect(
        validateNode({
          id: "cal2",
          type: "calendar",
          props: {
            mode: "month",
            events: [
              { date: "2026-02-21", label: "Sprint Review", intent: "info" },
              { date: "2026-02-28", label: "Release", intent: "success" },
            ],
          },
        }),
      ).toBeNull();
    });

    test("accepts calendar with src binding", () => {
      expect(
        validateNode({
          id: "cal3",
          type: "calendar",
          src: "/team/events",
          props: { mode: "agenda" },
        }),
      ).toBeNull();
    });
  });
});

// ─── Tree Roundtrip Tests ─────────────────────────────────────

describe("New primitives in tree roundtrip", () => {
  test("tree with all 4 new primitives writes and reads back", async () => {
    await setup();
    const ws = await connectWs();
    const session = await nextMessage(ws);
    const sessionId = session.sessionId as string;

    const tree = {
      id: "dashboard",
      type: "view",
      children: [
        { id: "clock", type: "time", props: { mode: "clock" } },
        { id: "cpu-chart", type: "chart", props: { variant: "line" }, src: "/monitoring/cpu" },
        {
          id: "fleet-map",
          type: "map",
          props: { center: [0, 0], zoom: 2 },
          src: "/fleet/vehicles",
        },
        {
          id: "team-cal",
          type: "calendar",
          props: { mode: "month", events: [{ date: "2026-03-01", label: "Launch" }] },
        },
      ],
    };

    // Write
    const writeResult = await afsRequest(ws, {
      type: "afs_write",
      reqId: "w1",
      path: `/ui/web/sessions/${sessionId}/tree`,
      content: tree,
    });
    expect(writeResult.type).toBe("afs_result");

    // Read back
    const readResult = await afsRequest(ws, {
      type: "afs_read",
      reqId: "r1",
      path: `/ui/web/sessions/${sessionId}/tree`,
    });
    expect(readResult.type).toBe("afs_result");
    const data = readResult.data as Record<string, unknown>;
    const root = data.content as Record<string, unknown>;
    expect(root.id).toBe("dashboard");
    const children = root.children as Array<Record<string, unknown>>;
    expect(children.length).toBe(4);
    expect(children.map((c) => c.type)).toEqual(["time", "chart", "map", "calendar"]);

    ws.close();
  });
});

// ─── Web Client HTML Renderer Tests ───────────────────────────

describe("Web client HTML contains new primitive renderers", () => {
  test("contains renderAupTime function", () => {
    expect(WEB_CLIENT_HTML).toContain("renderAupTime");
  });

  test("contains renderAupChart function", () => {
    expect(WEB_CLIENT_HTML).toContain("renderAupChart");
  });

  test("contains renderAupMap function", () => {
    expect(WEB_CLIENT_HTML).toContain("renderAupMap");
  });

  test("contains renderAupCalendar function", () => {
    expect(WEB_CLIENT_HTML).toContain("renderAupCalendar");
  });

  test("renderAupNode switch includes all 4 new types", () => {
    // Verify the switch/case in renderAupNode handles these types
    expect(WEB_CLIENT_HTML).toContain('"time"');
    expect(WEB_CLIENT_HTML).toContain('"chart"');
    expect(WEB_CLIENT_HTML).toContain('"map"');
    expect(WEB_CLIENT_HTML).toContain('"calendar"');
  });

  test("Chart.js CDN reference exists", () => {
    expect(WEB_CLIENT_HTML).toContain("chart.js");
  });

  test("Leaflet CDN reference exists", () => {
    expect(WEB_CLIENT_HTML).toContain("leaflet");
  });
});
