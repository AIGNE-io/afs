/**
 * Phase 3: Primitive registry + theme system + style system tests.
 *
 * Tests AFS routes for /primitives/, /themes/, and /style/.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { AFS } from "@aigne/afs";
import { AFSUIProvider, type WebBackend } from "@aigne/afs-ui";

let afs: AFS | null = null;
let backend: WebBackend | null = null;

async function setup() {
  afs = new AFS();
  const provider = new AFSUIProvider({ backend: "web", webOptions: { port: 0 } });
  await afs.mount(provider, "/ui");
  backend = (provider as unknown as { backend: WebBackend }).backend;
}

afterEach(async () => {
  if (backend) {
    await backend.close();
    backend = null;
  }
  afs = null;
});

describe("Primitive registry", () => {
  test("list /primitives returns all primitives", async () => {
    await setup();
    const result = await afs!.list("/ui/primitives");
    expect(result.data).toBeInstanceOf(Array);
    expect(result.data.length).toBe(15);
  });

  test("list includes fundamental primitives", async () => {
    await setup();
    const result = await afs!.list("/ui/primitives");
    const names = result.data.map((e) => e.id);
    for (const p of [
      "view",
      "text",
      "media",
      "input",
      "action",
      "overlay",
      "table",
      "time",
      "chart",
      "map",
      "calendar",
    ]) {
      expect(names).toContain(p);
    }
  });

  test("read /primitives/:name returns schema", async () => {
    await setup();
    const result = await afs!.read("/ui/primitives/view");
    expect(result.data?.content).toBeTruthy();
    const schema = result.data!.content as Record<string, unknown>;
    expect(schema.name).toBe("view");
    expect(schema.category).toBeTruthy();
  });

  test("read unknown primitive returns 404", async () => {
    await setup();
    await expect(afs!.read("/ui/primitives/nonexistent")).rejects.toThrow();
  });
});

describe("Component registry", () => {
  test("list /components returns all components", async () => {
    await setup();
    const result = await afs!.list("/ui/components");
    expect(result.data).toBeInstanceOf(Array);
    expect(result.data.length).toBe(22);
  });

  test("list includes subsystem components", async () => {
    await setup();
    const result = await afs!.list("/ui/components");
    const names = result.data.map((e) => e.id);
    for (const p of ["terminal", "rtc", "editor", "canvas", "deck", "frame"]) {
      expect(names).toContain(p);
    }
  });

  test("read /components/:name returns schema", async () => {
    await setup();
    const result = await afs!.read("/ui/components/terminal");
    expect(result.data?.content).toBeTruthy();
    const schema = result.data!.content as Record<string, unknown>;
    expect(schema.name).toBe("terminal");
    expect(schema.category).toBe("component");
  });

  test("read unknown component returns 404", async () => {
    await setup();
    await expect(afs!.read("/ui/components/nonexistent")).rejects.toThrow();
  });
});

// ── Composable Style System (new) ──

describe("Style system — directory structure", () => {
  test("list /style returns tones/, palettes/, recipes/", async () => {
    await setup();
    const result = await afs!.list("/ui/style");
    const ids = result.data.map((e: { id: string }) => e.id);
    expect(ids).toContain("tones");
    expect(ids).toContain("palettes");
    expect(ids).toContain("recipes");
  });

  test("explain /style returns style system overview with decision tree", async () => {
    await setup();
    const result = await afs!.explain("/ui/style");
    expect(result.content).toBeTruthy();
    const text = String(result.content);
    expect(text).toContain("Tone");
    expect(text).toContain("Palette");
    expect(text).toContain("editorial");
    expect(text).toContain("neutral");
  });
});

describe("Style system — tones", () => {
  test("list /style/tones returns 4 tones", async () => {
    await setup();
    const result = await afs!.list("/ui/style/tones");
    expect(result.data.length).toBe(4);
    const ids = result.data.map((e: { id: string }) => e.id);
    expect(ids).toContain("editorial");
    expect(ids).toContain("clean");
    expect(ids).toContain("bold");
    expect(ids).toContain("mono");
  });

  test("read /style/tones/editorial returns tone definition", async () => {
    await setup();
    const result = await afs!.read("/ui/style/tones/editorial");
    expect(result.data?.content).toBeTruthy();
    const tone = result.data!.content as Record<string, unknown>;
    expect(tone.name).toBe("editorial");
    expect(tone.description).toBeTruthy();
    expect(tone.character).toBeTruthy();
    expect(tone.useWhen).toBeTruthy();
    expect(tone.avoidWhen).toBeTruthy();
    expect(tone.tokens).toBeTruthy();
  });

  test("read unknown tone returns 404", async () => {
    await setup();
    await expect(afs!.read("/ui/style/tones/nonexistent")).rejects.toThrow();
  });

  test("explain /style/tones returns tone overview", async () => {
    await setup();
    const result = await afs!.explain("/ui/style/tones");
    const text = String(result.content);
    expect(text).toContain("editorial");
    expect(text).toContain("clean");
    expect(text).toContain("bold");
    expect(text).toContain("mono");
  });
});

describe("Style system — palettes", () => {
  test("list /style/palettes returns 5 palettes", async () => {
    await setup();
    const result = await afs!.list("/ui/style/palettes");
    expect(result.data.length).toBe(5);
    const ids = result.data.map((e: { id: string }) => e.id);
    expect(ids).toContain("neutral");
    expect(ids).toContain("warm");
    expect(ids).toContain("vivid");
    expect(ids).toContain("natural");
    expect(ids).toContain("electric");
  });

  test("read /style/palettes/warm returns dark + light color tokens", async () => {
    await setup();
    const result = await afs!.read("/ui/style/palettes/warm");
    expect(result.data?.content).toBeTruthy();
    const palette = result.data!.content as Record<string, unknown>;
    expect(palette.name).toBe("warm");
    expect(palette.dark).toBeTruthy();
    expect(palette.light).toBeTruthy();
  });

  test("read unknown palette returns 404", async () => {
    await setup();
    await expect(afs!.read("/ui/style/palettes/nonexistent")).rejects.toThrow();
  });
});

describe("Style system — recipes", () => {
  test("list /style/recipes returns 8 recipes", async () => {
    await setup();
    const result = await afs!.list("/ui/style/recipes");
    expect(result.data.length).toBe(8);
  });

  test("read /style/recipes/enterprise returns tone + palette + description", async () => {
    await setup();
    const result = await afs!.read("/ui/style/recipes/enterprise");
    expect(result.data?.content).toBeTruthy();
    const recipe = result.data!.content as Record<string, unknown>;
    expect(recipe.tone).toBe("clean");
    expect(recipe.palette).toBe("neutral");
    expect(recipe.description).toBeTruthy();
  });

  test("read unknown recipe returns 404", async () => {
    await setup();
    await expect(afs!.read("/ui/style/recipes/nonexistent")).rejects.toThrow();
  });

  test("explain /style/recipes returns recipe overview", async () => {
    await setup();
    const result = await afs!.explain("/ui/style/recipes");
    const text = String(result.content);
    expect(text).toContain("enterprise");
    expect(text).toContain("developer");
  });
});

// ── Legacy Theme System (kept for backward compat) ──

describe("Theme system", () => {
  test("list /themes returns available themes", async () => {
    await setup();
    const result = await afs!.list("/ui/themes");
    expect(result.data).toBeInstanceOf(Array);
    expect(result.data.length).toBeGreaterThan(0);
    const names = result.data.map((e) => e.id);
    expect(names).toContain("midnight");
  });

  test("read /themes/:name returns token map", async () => {
    await setup();
    const result = await afs!.read("/ui/themes/midnight");
    expect(result.data?.content).toBeTruthy();
    const theme = result.data!.content as Record<string, unknown>;
    expect(theme.name).toBe("midnight");
  });

  test("read unknown theme returns 404", async () => {
    await setup();
    await expect(afs!.read("/ui/themes/nonexistent")).rejects.toThrow();
  });
});
