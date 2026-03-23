import { expect, test } from "bun:test";
import { AFS, type AFSModule } from "@aigne/afs";

// Helper to create a minimal module that passes mount check
function createModule(name: string): AFSModule {
  return {
    name,
    stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
  };
}

test("AFS.findModulesInNamespace should match modules correctly", async () => {
  const moduleA = createModule("module-a");

  const afs = new AFS();
  await afs.mount(moduleA);

  // Test matching at root level - should match modules
  // Using findModulesInNamespace with default namespace (null)
  expect(afs["findModulesInNamespace"]("/", null)).toContainAllValues([
    {
      module: moduleA,
      modulePath: "/modules/module-a",
      maxDepth: 0,
      subpath: "/",
      remainedModulePath: "/modules",
    },
  ]);

  // Test matching /modules - should show module-a at depth 0
  expect(afs["findModulesInNamespace"]("/modules", null)).toContainAllValues([
    {
      module: moduleA,
      modulePath: "/modules/module-a",
      maxDepth: 0,
      subpath: "/",
      remainedModulePath: "/module-a",
    },
  ]);

  // Test matching /modules/module-a - should match with subpath /
  expect(afs["findModulesInNamespace"]("/modules/module-a", null)).toContainAllValues([
    {
      module: moduleA,
      modulePath: "/modules/module-a",
      maxDepth: 1,
      subpath: "/",
      remainedModulePath: "/",
    },
  ]);

  // Test matching /modules/module-a/foo - should match with subpath /foo
  expect(afs["findModulesInNamespace"]("/modules/module-a/foo", null)).toContainAllValues([
    {
      module: moduleA,
      modulePath: "/modules/module-a",
      maxDepth: 1,
      subpath: "/foo",
      remainedModulePath: "/",
    },
  ]);

  // Test with maxDepth 2 at root
  expect(afs["findModulesInNamespace"]("/", null, { maxDepth: 2 })).toContainAllValues([
    {
      module: moduleA,
      modulePath: "/modules/module-a",
      maxDepth: 0,
      subpath: "/",
      remainedModulePath: "/modules/module-a",
    },
  ]);

  // Test with maxDepth 2 at /modules
  expect(afs["findModulesInNamespace"]("/modules", null, { maxDepth: 2 })).toContainAllValues([
    {
      module: moduleA,
      modulePath: "/modules/module-a",
      maxDepth: 1,
      subpath: "/",
      remainedModulePath: "/module-a",
    },
  ]);

  // Test with maxDepth 2 at /modules/module-a
  expect(
    afs["findModulesInNamespace"]("/modules/module-a", null, { maxDepth: 2 }),
  ).toContainAllValues([
    {
      module: moduleA,
      modulePath: "/modules/module-a",
      maxDepth: 2,
      subpath: "/",
      remainedModulePath: "/",
    },
  ]);

  // Test with maxDepth 2 at /modules/module-a/foo
  expect(
    afs["findModulesInNamespace"]("/modules/module-a/foo", null, { maxDepth: 2 }),
  ).toContainAllValues([
    {
      module: moduleA,
      modulePath: "/modules/module-a",
      maxDepth: 2,
      subpath: "/foo",
      remainedModulePath: "/",
    },
  ]);
});

test("AFS.findModulesInNamespace should not match modules with similar prefixes", async () => {
  // Regression test: /github/ArcBlock/afs should NOT match /github/ArcBlock/afsd
  const moduleAfs = createModule("afs");
  const moduleAfsd = createModule("afsd");
  const moduleAigne = createModule("aigne-framework");

  const afs = new AFS();
  await afs.mount(moduleAfs, "/github/ArcBlock/afs");
  await afs.mount(moduleAfsd, "/github/ArcBlock/afsd");
  await afs.mount(moduleAigne, "/github/ArcBlock/aigne-framework");

  // Test that /github/ArcBlock/afs only matches moduleAfs
  const matchesAfs = afs["findModulesInNamespace"]("/github/ArcBlock/afs", null);
  expect(matchesAfs).toHaveLength(1);
  expect(matchesAfs[0]!.module).toBe(moduleAfs);
  expect(matchesAfs[0]!.modulePath).toBe("/github/ArcBlock/afs");

  // Test that /github/ArcBlock/afsd only matches moduleAfsd
  const matchesAfsd = afs["findModulesInNamespace"]("/github/ArcBlock/afsd", null);
  expect(matchesAfsd).toHaveLength(1);
  expect(matchesAfsd[0]!.module).toBe(moduleAfsd);
  expect(matchesAfsd[0]!.modulePath).toBe("/github/ArcBlock/afsd");

  // Test that /github/ArcBlock matches all three modules
  const matchesParent = afs["findModulesInNamespace"]("/github/ArcBlock", null);
  expect(matchesParent).toHaveLength(3);
  expect(matchesParent.map((m) => m.module.name).sort()).toEqual([
    "afs",
    "afsd",
    "aigne-framework",
  ]);
});
