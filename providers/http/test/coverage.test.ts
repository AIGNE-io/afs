import { test } from "bun:test";
import { importAllModules } from "@aigne/scripts/import-all-modules.js";

test("import all modules for coverage tracking", async () => {
  await importAllModules(import.meta, "../src");
});
