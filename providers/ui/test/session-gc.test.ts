import { describe, expect, it } from "bun:test";
import { createMockInputSource } from "../src/tty.js";
import { AFSUIProvider } from "../src/ui-provider.js";

function createTtyProvider() {
  const inputSource = createMockInputSource();
  const stdout = { write: () => true };
  return new AFSUIProvider({
    backend: "tty",
    ttyOptions: { inputSource, stdout },
  });
}

describe("UI session GC", () => {
  it("reclaims stale sessions and matching AUP state", async () => {
    const provider = createTtyProvider();

    const stale = provider.sessions.create("tty");
    await provider.write(`/tty/sessions/${stale.id}/tree`, {
      content: {
        id: "root",
        type: "view",
        children: [],
      },
    });

    // Force this session to become stale and trigger provider-level GC.
    (provider as any).sessionMaxInactiveMs = 1;
    (stale as any)._lastActive = Date.now() - 10_000;
    await provider.list("/tty/sessions");

    expect(provider.sessions.has(stale.id)).toBe(false);
    expect((provider as any).aupRegistry.has(stale.id)).toBe(false);
  });
});
